#!/usr/bin/env node
// Turns the generated drawing set into a tile pyramid.
//
// Run locally, once, like setgen. In production this is an ingest job that runs
// when a set is uploaded; nothing here belongs in a browser or in a request.
//
// The output is what a CDN serves: small images, addressed by sheet, level and
// position. A viewer fetches only the tiles its screen covers, which is why the
// bytes it moves scale with the size of the screen rather than the size of the
// document.

import { fork } from "node:child_process";
import { availableParallelism } from "node:os";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { MAX_LEVEL, pyramid, TILE } from "./pyramid.mjs";
import { openSheet, renderLevel } from "./render.mjs";

const { values } = parseArgs({
  options: {
    set: { type: "string", default: "data/sets/v1" },
    /* Inside the set, because tiles are derived from it and a set should be one
       thing to copy or delete. It also means the existing sheet server on :4200
       serves them, with no second origin and no change to sources.json. */
    out: { type: "string", default: "data/sets/v1/tiles" },
    quality: { type: "string", default: "80" },
    only: { type: "string" },
    limit: { type: "string" },
    /* Rasterizing is CPU-bound in one thread, so the whole job is one core
       unless it is split. Sheets are independent — nothing shares state — so
       slicing the list across processes is the whole parallelisation. */
    workers: { type: "string" },
    slice: { type: "string" },
  },
});

const setDir = resolve(process.cwd(), values.set);

/* Revision 1 keeps the tile paths the set has always had; a reissue nests
   under its sheet, so everything belonging to A-101 is still one directory. */
function tileDir(sheet) {
  return sheet.revision > 1
    ? join(sheet.sheetId, `r${sheet.revision}`)
    : sheet.sheetId;
}
const outDir = resolve(process.cwd(), values.out);
const quality = Number(values.quality);

/* Runs the children and merges what they wrote. Each child owns a disjoint set
   of sheets and its own partial manifest, so nothing has to be locked. */
async function runWorkers(sheets, workerCount) {
  const started = Date.now();
  await Promise.all(
    Array.from({ length: workerCount }, (_, i) =>
      new Promise((done, fail) => {
        const child = fork(fileURLToPath(import.meta.url), [
          `--set=${values.set}`,
          `--out=${values.out}`,
          `--quality=${values.quality}`,
          ...(values.limit ? [`--limit=${values.limit}`] : []),
          `--slice=${i}/${workerCount}`,
        ]);
        child.on("exit", (code) =>
          code === 0 ? done() : fail(new Error(`worker ${i} exited ${code}`)),
        );
      }),
    ),
  );

  const manifest = [];
  for (let i = 0; i < workerCount; i += 1) {
    const partial = join(outDir, `.part-${i}.json`);
    manifest.push(...JSON.parse(await readFile(partial, "utf8")));
    await rm(partial, { force: true });
  }
  manifest.sort(
    (a, b) =>
      a.sheetId.localeCompare(b.sheetId) ||
      (a.revision ?? 1) - (b.revision ?? 1),
  );

  const totalBytes = manifest.reduce((sum, s) => sum + s.bytes, 0);
  await writeManifests(manifest);

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `${manifest.length} sheet revisions, ${(totalBytes / 1024 / 1024).toFixed(1)} MB, ` +
      `${seconds}s across ${workerCount} workers -> ${values.out}`,
  );
  console.log(
    `average ${(totalBytes / manifest.length / 1024).toFixed(0)} KB per sheet`,
  );
}

/* One small file per sheet, not one large file for the set.

   A single manifest describing all 1,500 sheets is 1.1 MB, and it would have to
   arrive before the first tile could even be requested — five seconds at the
   link rate these measurements use, spent describing 1,499 sheets nobody asked
   for. A viewer needs the grid for the sheet it is opening and nothing else.

   The set-level file carries only what is the same everywhere: tile size, the
   deepest level, and the encoder setting. */
async function writeManifests(manifest) {
  await writeFile(
    join(outDir, "tiles.json"),
    `${JSON.stringify(
      {
        tileSize: TILE,
        maxLevel: MAX_LEVEL,
        quality,
        sheetCount: manifest.filter((s) => !s.revision).length,
        revisionCount: manifest.filter((s) => s.revision).length,
      },
      null,
      2,
    )}\n`,
  );

  for (const sheet of manifest) {
    await writeFile(
      join(outDir, tileDir(sheet), "tile-index.json"),
      `${JSON.stringify(sheet)}\n`,
    );
  }
}

async function main() {
  const index = JSON.parse(
    await readFile(join(setDir, "sheet-index.json"), "utf8"),
  );

  /* Reissues are listed in setgen's manifest with the file each one was
     written to, so the tiler reads where they are rather than repeating
     setgen's naming rule. A reissue is tiled exactly like revision 1: it is a
     sheet in its own right, and Compare needs a whole pyramid for each side. */
  const issued = JSON.parse(
    await readFile(join(setDir, "manifest.json"), "utf8"),
  );
  const fileOf = new Map(issued.sheets.map((s) => [s.sheetId, s.file]));

  let base = index.sheets;
  if (values.only) base = base.filter((s) => s.sheetId === values.only);
  if (values.limit) base = base.slice(0, Number(values.limit));

  const chosen = new Set(base.map((s) => s.sheetId));
  let sheets = [
    ...base.map((s) => ({ ...s, revision: 1, file: fileOf.get(s.sheetId) })),
    ...issued.revisions.filter((r) => chosen.has(r.sheetId)),
  ];

  const isChild = Boolean(values.slice);
  const workerCount = isChild
    ? 1
    : Number(values.workers ?? Math.max(1, availableParallelism() - 2));

  if (!isChild && workerCount > 1 && sheets.length > workerCount) {
    await rm(outDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });
    await runWorkers(sheets, workerCount);
    return;
  }

  /* A child takes every Nth sheet rather than a contiguous block, so the work
     is even when sheets differ in cost. */
  let sliceIndex = 0;
  if (isChild) {
    const [part, of] = values.slice.split("/").map(Number);
    sliceIndex = part;
    sheets = sheets.filter((_, i) => i % of === part);
  }

  if (sheets.length === 0) {
    console.error(`no sheets selected from ${values.set}`);
    process.exit(1);
  }

  if (!values.only && !values.limit && !isChild) {
    await rm(outDir, { recursive: true, force: true });
  }
  await mkdir(outDir, { recursive: true });

  const started = Date.now();
  let totalBytes = 0;
  let totalTiles = 0;
  const manifest = [];

  for (const [i, sheet] of sheets.entries()) {
    const doc = await openSheet(join(setDir, sheet.file));
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const aspect = base.width / base.height;

    const levels = pyramid(aspect);
    let sheetBytes = 0;

    for (const level of levels) {
      const dir = join(outDir, tileDir(sheet), `l${level.level}`);
      await mkdir(dir, { recursive: true });
      for (const tile of await renderLevel(page, level, quality)) {
        await writeFile(join(dir, `${tile.col}_${tile.row}.webp`), tile.bytes);
        sheetBytes += tile.bytes.length;
        totalTiles += 1;
      }
    }

    /* Per sheet, because a viewer needs the grid before it can ask for a tile:
       how many levels exist, how big each is, and what the page measures in
       sheet-space. Without it the first request is a guess. */
    manifest.push({
      sheetId: sheet.sheetId,
      /* Only on a reissue, so revision 1's index is byte for byte the file it
         was before revisions existed. Absent means 1, as in the sheet index. */
      ...(sheet.revision > 1 ? { revision: sheet.revision } : {}),
      title: sheet.title,
      discipline: sheet.discipline,
      pageWidth: base.width,
      pageHeight: base.height,
      levels: levels.map(({ level, width, height, cols, rows }) => ({
        level,
        width,
        height,
        cols,
        rows,
      })),
      bytes: sheetBytes,
    });

    totalBytes += sheetBytes;
    // Releases the parsed document. 1,500 of these accumulate otherwise, which
    // is the same mistake the naive renderer makes in the browser.
    await doc.cleanup();

    if (!isChild && ((i + 1) % 25 === 0 || i + 1 === sheets.length)) {
      const rate = (i + 1) / ((Date.now() - started) / 1000);
      const left = Math.round((sheets.length - i - 1) / rate);
      process.stdout.write(
        `  ${i + 1}/${sheets.length}  ${(totalBytes / 1024 / 1024).toFixed(0)} MB` +
          `  ${rate.toFixed(1)}/s  ~${left}s left\n`,
      );
    }
  }

  if (isChild) {
    await writeFile(
      join(outDir, `.part-${sliceIndex}.json`),
      JSON.stringify(manifest),
    );
    return;
  }

  await writeManifests(manifest);

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `${sheets.length} sheets, ${totalTiles} tiles, ` +
      `${(totalBytes / 1024 / 1024).toFixed(1)} MB, ${seconds}s -> ${values.out}`,
  );
  console.log(
    `average ${(totalBytes / sheets.length / 1024).toFixed(0)} KB per sheet`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

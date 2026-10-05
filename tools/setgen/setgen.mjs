#!/usr/bin/env node
// Generates the synthetic drawing set the rendering work is measured against.
//
// Run locally, never in the browser. The output is not committed: the seed is
// what makes the set reproducible, so the bytes can be regenerated instead of
// carried in git. Each run writes `manifest.json` beside the sheets with a
// checksum per sheet, and prints one set-level checksum over all of them — that
// single line is what someone else can compare against to show they generated
// the same set, without a copy of the bytes changing hands.
//
// Every number the viewer is measured against depends on this set being the same
// set, so determinism here is not tidiness — it is the thing that makes two
// measurements comparable.

import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { combineSheets } from "./combine.mjs";
import { renderSheet } from "./render.mjs";
import { latestRevision, sheetFile } from "./revisions.mjs";
import { buildSheetList } from "./sheets.mjs";

const DEFAULTS = { out: "data/sets/v1", count: "1500", seed: "gridline-v1" };

const { values } = parseArgs({
  options: {
    out: { type: "string", default: DEFAULTS.out },
    count: { type: "string", default: DEFAULTS.count },
    seed: { type: "string", default: DEFAULTS.seed },
    only: { type: "string" },
  },
});

const count = Number(values.count);
if (!Number.isInteger(count) || count < 1) {
  console.error(`--count must be a positive integer, received ${values.count}`);
  process.exit(1);
}

const outDir = resolve(process.cwd(), values.out);
const sheetsDir = join(outDir, "sheets");

async function main() {
  const all = buildSheetList(count);
  const sheets = values.only
    ? all.filter((s) => s.sheetId === values.only)
    : all;

  if (values.only && sheets.length === 0) {
    console.error(`--only ${values.only} is not in a set of ${count} sheets`);
    process.exit(1);
  }

  // A partial run must not delete the rest of a set, and must not leave a stale
  // manifest describing sheets it did not write.
  if (!values.only) await rm(outDir, { recursive: true, force: true });
  await mkdir(sheetsDir, { recursive: true });

  const started = Date.now();
  const entries = [];
  // Reissues, kept apart from `entries` so the set checksum still describes
  // revision 1 alone and stays comparable with every run before revisions.
  const revisions = [];
  const latest = new Map();

  for (const sheet of sheets) {
    const last = latestRevision(values.seed, sheet.sheetId);
    latest.set(sheet.sheetId, last);

    for (let revision = 1; revision <= last; revision += 1) {
      const bytes = await renderSheet({ ...sheet, revision }, values.seed);
      const file = sheetFile(sheet.sheetId, revision);
      await writeFile(join(outDir, file), bytes);

      (revision === 1 ? entries : revisions).push({
        sheetId: sheet.sheetId,
        title: sheet.title,
        discipline: sheet.discipline,
        series: sheet.series,
        revision,
        file,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }

    if (entries.length % 100 === 0) {
      process.stdout.write(`  ${entries.length}/${sheets.length}\n`);
    }
  }

  if (values.only) {
    for (const entry of [...entries, ...revisions]) {
      console.log(
        `${entry.file}  ${entry.bytes} bytes  ${entry.sha256}`,
      );
    }
    return;
  }

  /* The set as one document, which is what a drawing set is when it is issued.
     The individual sheets stay on disk as the input the tiler consumes; this is
     the input the naive renderer opens. Same sheets on both sides, so the
     comparison is about technique rather than about the data. */
  process.stdout.write("  combining into one document\n");
  const { bytes: combinedBytes, index } = await combineSheets(
    sheets,
    (sheet) => readFile(join(outDir, `sheets/${sheet.sheetId}.pdf`)),
    (done, all) => process.stdout.write(`    ${done}/${all}\n`),
  );
  await writeFile(join(outDir, "combined.pdf"), combinedBytes);

  /* The combined document is the set as first issued, so it stays revision 1.
     The index says which sheets have been reissued since: `revision` appears
     only on those, and its absence means 1. Carrying it on all 1,500 entries
     would grow a file every client fetches to describe sixty sheets. */
  const indexed = index.map((entry) => {
    const revision = latest.get(entry.sheetId);
    return revision > 1 ? { ...entry, revision } : entry;
  });
  await writeFile(
    join(outDir, "sheet-index.json"),
    `${JSON.stringify({ seed: values.seed, sheets: indexed }, null, 2)}\n`,
  );

  const total = entries.reduce((sum, e) => sum + e.bytes, 0);
  const revisionTotal = revisions.reduce((sum, e) => sum + e.bytes, 0);

  // One checksum over every sheet's checksum, taken in sheet-number order so it
  // does not depend on the order the loop wrote them in. Two people comparing
  // this one line have compared 1,500 files.
  const setChecksum = createHash("sha256")
    .update(
      [...entries]
        .sort((a, b) => a.sheetId.localeCompare(b.sheetId))
        .map((e) => `${e.sheetId} ${e.sha256}`)
        .join("\n"),
    )
    .digest("hex");

  const revisionChecksum = createHash("sha256")
    .update(
      [...revisions]
        .sort((a, b) => a.file.localeCompare(b.file))
        .map((e) => `${e.file} ${e.sha256}`)
        .join("\n"),
    )
    .digest("hex");

  await writeFile(
    join(outDir, "manifest.json"),
    `${JSON.stringify(
      {
        seed: values.seed,
        count,
        sheetCount: entries.length,
        setChecksum,
        revisionChecksum,
        sheets: entries,
        revisions,
      },
      null,
      2,
    )}\n`,
  );

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `${entries.length} sheets, ${(total / 1024 / 1024).toFixed(1)} MB, ${seconds}s -> ${values.out}`,
  );
  console.log(
    `combined.pdf  ${index.length} pages, ${(combinedBytes.length / 1024 / 1024).toFixed(1)} MB`,
  );
  console.log(
    `${revisions.length} revisions across ${new Set(revisions.map((r) => r.sheetId)).size} sheets, ` +
      `${(revisionTotal / 1024 / 1024).toFixed(1)} MB`,
  );
  console.log(`set checksum ${setChecksum}`);
  console.log(`revision checksum ${revisionChecksum}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { mkdir, readFile, writeFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

/* A correctness check, not a measurement. It lives here because every
   browser spec in the project does, and it shares the harness: the static
   servers, the shell, compare's own `gridline:changes-found` span.

   For every reissue in the set's manifest, compare the revision before it
   with it and check that **every level-3 tile whose bytes differ between the
   two is touched by a detected region**: no edit goes unboxed. A reissue
   leaves unchanged areas byte-identical, so a differing tile is where an
   edit is. That needs nothing from setgen's own record of what it edited,
   which compare never sees either.

   The tiles' bytes are read from disk: they are the answer key, not the
   thing being tested. Detection runs in the browser, as a user's does, over
   the throttled link, so the 64 comparisons take several minutes. No CPU
   throttle: this asks whether, not how fast.

   Extra regions are not failures. The title block's revision field always
   differs, and a region larger than its edit is still the edit boxed. */

const SET = "data/sets/v1";
/* As the tiler cuts them, and as compare's pyramid module reads them. */
const TILE_SIZE = 512;
const LEVEL = 3;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface TileIndex {
  pageWidth: number;
  pageHeight: number;
  levels: { level: number; width: number; height: number; cols: number; rows: number }[];
}

const dirOf = (sheetId: string, revision: number) =>
  revision === 1 ? `${SET}/tiles/${sheetId}` : `${SET}/tiles/${sheetId}/r${revision}`;

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/* The level-3 tiles that differ, as rectangles in sheet space. */
async function changedTiles(sheetId: string, from: number, to: number): Promise<{ tile: string; rect: Rect }[]> {
  const index = JSON.parse(await readFile(`${dirOf(sheetId, to)}/tile-index.json`, "utf8")) as TileIndex;
  const level = index.levels.find((l) => l.level === LEVEL);
  if (!level) throw new Error(`${sheetId} REV ${to} has no level ${LEVEL}`);
  const size = TILE_SIZE * (index.pageWidth / level.width);

  const changed: { tile: string; rect: Rect }[] = [];
  for (let row = 0; row < level.rows; row += 1) {
    for (let col = 0; col < level.cols; col += 1) {
      const name = `l${LEVEL}/${col}_${row}.webp`;
      const [a, b] = await Promise.all([
        readFile(`${dirOf(sheetId, from)}/${name}`),
        readFile(`${dirOf(sheetId, to)}/${name}`),
      ]);
      if (a.equals(b)) continue;
      const x = col * size;
      const y = row * size;
      changed.push({
        tile: `${col}_${row}`,
        rect: { x, y, width: Math.min(size, index.pageWidth - x), height: Math.min(size, index.pageHeight - y) },
      });
    }
  }
  return changed;
}

test("compare — every changed tile is boxed", async ({ page }) => {
  test.setTimeout(1_800_000);

  const manifest = JSON.parse(await readFile(`${SET}/manifest.json`, "utf8")) as {
    revisions: { sheetId: string; revision: number }[];
  };

  const results: {
    sheetId: string;
    from: number;
    to: number;
    changedTiles: number;
    regions: number;
    missed: string[];
  }[] = [];

  for (const { sheetId, revision } of manifest.revisions) {
    const from = revision - 1;
    const tiles = await changedTiles(sheetId, from, revision);

    await page.goto(`/?view=compare&sheet=${sheetId}&from=${from}&to=${revision}`, { waitUntil: "commit" });
    await page.waitForFunction(
      () => performance.getEntriesByName("gridline:changes-found", "measure").length > 0,
      undefined,
      { timeout: 120_000 },
    );
    const regions = await page.evaluate(() => {
      const found = performance.getEntriesByName("gridline:changes-found", "measure")[0] as PerformanceMeasure;
      return (found.detail as { regions: { rect: Rect }[] }).regions.map((r) => r.rect);
    });

    const missed = tiles.filter(({ rect }) => !regions.some((region) => overlaps(region, rect))).map((t) => t.tile);
    results.push({ sheetId, from, to: revision, changedTiles: tiles.length, regions: regions.length, missed });
    console.log(
      `    ${sheetId} REV ${from} → ${revision}  ${tiles.length} tiles changed  ${regions.length} regions` +
        (missed.length ? `  MISSED ${missed.join(", ")}` : ""),
    );
  }

  const failures = results.filter((r) => r.missed.length > 0);
  await mkdir("perf-results", { recursive: true });
  await writeFile(
    "perf-results/compare-coverage.json",
    `${JSON.stringify({ takenAt: new Date().toISOString(), level: LEVEL, comparisons: results.length, failures: failures.length, results }, null, 2)}\n`,
  );
  console.log(`\n  ${results.length} comparisons, ${failures.length} with a changed tile left unboxed`);
  console.log("  written to perf-results/compare-coverage.json\n");

  expect(results.length).toBe(manifest.revisions.length);
  expect(failures, "changed tiles with no region over them").toEqual([]);
});

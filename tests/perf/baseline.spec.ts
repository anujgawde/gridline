import { mkdir, writeFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { format, summarize } from "./stats";
import {
  applyProfile,
  collectLongTasks,
  PROFILE,
  readHeapBytes,
  readLongTasks,
} from "./throttle";

/* The starting numbers for the viewer, taken against the `fullpage` renderer:
   pdf.js parsing on the main thread, the whole sheet rasterized in one pass.

   This is the measurement that cannot be retaken. Once tiles and a worker exist
   the slow path is no longer what runs, and nobody rebuilds it to recover a
   "before". Everything here is therefore recorded before any optimisation lands.

   These are readings, not gates. Nothing in this file asserts a budget — the
   budgets in buildplan.md §7 become failing assertions in 1.6, once there is an
   optimised path to hold to them. Asserting them now would only encode how slow
   the naive version happens to be. */

const RUNS = Number(process.env.PERF_RUNS ?? 5);
const SHEET_ID = process.env.PERF_SHEET ?? "A-101";

const ORIGINS = {
  shell: "http://localhost:4100",
  viewer: "http://localhost:4101/remoteEntry.js",
  sheets: `http://localhost:4200/sheets/${SHEET_ID}.pdf`,
};

interface Sample {
  coldSheetOnCanvasMs: number;
  sheetFirstPaintMs: number | null;
  pdfjsLoadMs: number | null;
  sheetParseMs: number | null;
  sheetRasterMs: number | null;
  shellFirstContentfulPaintMs: number | null;
  mainThreadBlockedMs: number;
  longestTaskMs: number;
  heapUsedMb: number;
}

test.beforeAll(async ({ request }) => {
  for (const [name, url] of Object.entries(ORIGINS)) {
    const response = await request.get(url).catch(() => null);
    expect(
      response?.ok(),
      `${name} is not being served at ${url}. Run \`pnpm build && pnpm serve\` first — these numbers are only meaningful against a static server, never the dev server.`,
    ).toBe(true);
  }
});

test(`fullpage renderer — cold load of ${SHEET_ID}, ${RUNS} runs`, async ({
  browser,
}) => {
  test.setTimeout(RUNS * 180_000);

  const samples: Sample[] = [];

  for (let run = 0; run < RUNS; run += 1) {
    /* A fresh context per run, because "cold" means an empty HTTP cache and no
       service worker already installed. Reusing one page would measure the
       second load onwards, which is a different budget entirely. */
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
    });
    const page = await context.newPage();

    await collectLongTasks(page);
    const client = await applyProfile(page);

    const startedAt = Date.now();
    await page.goto(`http://localhost:4100/?renderer=fullpage&sheet=${SHEET_ID}`, {
      waitUntil: "commit",
    });
    await page.waitForSelector(
      '[data-renderer="fullpage"][data-state="painted"]',
      { timeout: 180_000 },
    );
    const coldSheetOnCanvasMs = Date.now() - startedAt;

    const marks = await page.evaluate(() => {
      const measure = (name: string) =>
        performance.getEntriesByName(name, "measure")[0]?.duration ?? null;
      const paint = performance.getEntriesByName("first-contentful-paint")[0];
      return {
        sheetFirstPaintMs: measure("gridline:sheet-first-paint"),
        pdfjsLoadMs: measure("gridline:pdfjs-load"),
        sheetParseMs: measure("gridline:sheet-parse"),
        sheetRasterMs: measure("gridline:sheet-raster"),
        firstContentfulPaintMs: paint ? paint.startTime : null,
      };
    });

    const longTasks = await readLongTasks(page);
    const heapBytes = await readHeapBytes(client);

    samples.push({
      coldSheetOnCanvasMs,
      sheetFirstPaintMs: marks.sheetFirstPaintMs,
      pdfjsLoadMs: marks.pdfjsLoadMs,
      sheetParseMs: marks.sheetParseMs,
      sheetRasterMs: marks.sheetRasterMs,
      shellFirstContentfulPaintMs: marks.firstContentfulPaintMs,
      mainThreadBlockedMs: longTasks.totalMs,
      longestTaskMs: longTasks.longestMs,
      heapUsedMb: heapBytes / 1024 / 1024,
    });

    console.log(
      `    run ${run + 1}/${RUNS}  sheet on canvas ${coldSheetOnCanvasMs} ms`,
    );
    await context.close();
  }

  const pick = (key: keyof Sample) => summarize(samples.map((s) => s[key]));

  const reading = {
    takenAt: new Date().toISOString(),
    profile: PROFILE.label,
    renderer: "fullpage",
    sheetId: SHEET_ID,
    runs: RUNS,
    metrics: {
      // Navigation to the sheet being on the canvas — the "sheet first paint,
      // cold" budget.
      coldSheetOnCanvas: pick("coldSheetOnCanvasMs"),
      // Inside that: the viewer's own work, once it had an address to fetch.
      sheetFirstPaint: pick("sheetFirstPaintMs"),
      // Split three ways: fetching the library, parsing the document, and
      // turning it into pixels. They improve for different reasons.
      pdfjsLoad: pick("pdfjsLoadMs"),
      sheetParse: pick("sheetParseMs"),
      sheetRaster: pick("sheetRasterMs"),
      // The shell's chrome, which paints before any remote is involved.
      shellFirstContentfulPaint: pick("shellFirstContentfulPaintMs"),
      mainThreadBlocked: pick("mainThreadBlockedMs"),
      longestTask: pick("longestTaskMs"),
      heapUsedMb: pick("heapUsedMb"),
    },
    samples,
  };

  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/phase1-baseline.json",
    `${JSON.stringify(reading, null, 2)}\n`,
  );

  console.log(`\n  baseline — ${PROFILE.label}, ${SHEET_ID}, median of ${RUNS}`);
  for (const [key, stat] of Object.entries(reading.metrics)) {
    const unit = key === "heapUsedMb" ? "MB" : "ms";
    console.log(`    ${key.padEnd(28)} ${format(stat, unit)}`);
  }
  console.log(`\n  written to test-results/phase1-baseline.json\n`);

  /* The only assertions: something was actually measured, on every run. A run
     where the sheet never painted would otherwise write a file of nulls. */
  expect(reading.metrics.coldSheetOnCanvas.samples).toBe(RUNS);
  expect(reading.metrics.sheetFirstPaint.median).not.toBeNull();
});

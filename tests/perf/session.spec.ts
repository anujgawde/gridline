import { mkdir, writeFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { panAndZoom, startFrameRecording, stopFrameRecording } from "./frames";
import { BUDGETS, isGated } from "./budgets";
import { format, summarize } from "./stats";
import {
  applyProfile,
  collectLongTasks,
  PROFILE,
  readHeapBytes,
  readLongTasks,
} from "./throttle";

/* A session, which is the scenario this project is actually about: one person,
   one tab, one enormous document, for a while.
   
   A cold load of a single sheet is the cheapest thing the app will ever do, and
   nothing about it is a claim worth making. What breaks a drawing viewer is the
   twentieth sheet, not the first — memory that is never released, frames that
   get longer, a tab that stops responding. None of that is visible in a page
   load, so none of it was being measured.

   The naive renderer is expected to fail this. That is the point: "it crosses
   the memory budget at sheet N and stops responding" is a finding. It is
   recorded rather than avoided. */

const SHEETS = Number(process.env.PERF_SHEETS ?? 50);

/* How the session moves through the set. Two shapes, and they answer different
   questions — a feature built for one can be measured as a regression by the
   other, so neither is "the" session.

     stride      every Nth sheet, jumping disciplines. The stress case: it
                 deliberately defeats locality, so nothing can score well by
                 accident. This is what every number recorded so far used.
     sequential  neighbouring sheets in set order, which is how a drawing set is
                 actually read — around a detail, across adjacent sheets. This is
                 the case prefetch exists for and the only one that can judge it.

   Default stays `stride` so existing readings remain comparable. */
const WALKS = ["stride", "sequential"] as const;
type Walk = (typeof WALKS)[number];
const WALK = (process.env.PERF_WALK ?? "stride") as Walk;
if (!WALKS.includes(WALK)) {
  throw new Error(`PERF_WALK must be one of ${WALKS.join(", ")} — got ${WALK}`);
}
/* Both renderers run the identical script against the identical document.
   Anything else and the comparison is between two experiments. */
const RENDERER = process.env.PERF_RENDERER ?? "tiled";
/* The first sheet has to wait for a 42 MB document over a paced link, which is
   minutes rather than seconds. Later sheets are fast, so this bound is generous
   for almost every step and only load-bearing for the first. */
const SHEET_TIMEOUT_MS = Number(process.env.PERF_SHEET_TIMEOUT ?? 420_000);

/* A marker on the memory curve, not the pass mark. The 400 MB figure was
   written before any code existed, so recording which sheet the curve crosses
   it stays useful while grading against it never was. The gate that does apply
   is in budgets.ts and comes from a measurement of this renderer. */
const MEMORY_MARKER_MB = 400;

interface SheetReading {
  ordinal: number;
  sheetId: string;
  msToPaint: number | null;
  jsHeapMb: number;
  pixelMemoryMb: number;
  pagesHeld: number;
  /* Cumulative since the renderer mounted, counted per tile needed rather than
     per lookup. Recorded per sheet so the rate can be read over a span — the
     revisit phase below is the span that matters. */
  hits: number;
  misses: number;
  mainThreadBlockedMs: number;
  frameP95Ms: number;
  frameWorstMs: number;
  failed?: string;
}

test(`${RENDERER} renderer — a ${WALK} session across the set`, async ({
  browser,
  request,
}) => {
  test.setTimeout(SHEETS * SHEET_TIMEOUT_MS + 300_000);

  const indexResponse = await request.get(
    "http://localhost:4200/sheet-index.json",
  );
  expect(
    indexResponse.ok(),
    "the sheet set is not being served on :4200. Run `pnpm setgen` then `pnpm build && pnpm serve`.",
  ).toBe(true);
  const all = (await indexResponse.json()).sheets as { sheetId: string }[];

  /* `stride` spreads across the whole set rather than taking the first N:
     consecutive sheets in one discipline would understate the work, since a
     session that jumps between architectural, structural and mechanical defeats
     any accidental locality in the document.

     `sequential` is that locality on purpose — neighbouring sheets, in order,
     from the start of the set. Not a weaker version of the above; a different
     question. Reading a set is a local activity, and a cache or a prefetch built
     for that cannot be judged by a walk designed to defeat it. */
  const stride = Math.max(1, Math.floor(all.length / SHEETS));
  const visits =
    WALK === "sequential"
      ? all.slice(0, SHEETS).map((sheet) => sheet.sheetId)
      : Array.from({ length: SHEETS }, (_, i) => all[i * stride].sheetId);

  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
  });
  const page = await context.newPage();

  let crashed = false;
  page.on("crash", () => {
    crashed = true;
  });

  await collectLongTasks(page);
  const client = await applyProfile(page);

  const readings: SheetReading[] = [];
  let firstSheetMs: number | null = null;
  let documentOpenMs: number | null = null;
  let failedAt: SheetReading | null = null;

  const coldStart = Date.now();
  await page.goto(`/?renderer=${RENDERER}`, { waitUntil: "commit" });

  for (const [i, sheetId] of visits.entries()) {
    if (crashed) break;

    const startedAt = Date.now();
    let failure: string | undefined;

    try {
      if (i === 0) {
        // The first sheet includes opening the 1,500-page document.
        await page.waitForSelector('[data-renderer][data-state="painted"]', {
          timeout: SHEET_TIMEOUT_MS,
        });
        firstSheetMs = Date.now() - coldStart;
        documentOpenMs = await page.evaluate(
          () =>
            performance.getEntriesByName("gridline:document-open", "measure")[0]
              ?.duration ?? null,
        );
      }

      // Navigation goes through the shell's controls and over the bus, which is
      // how Navigator will drive it — not by reaching into the component.
      const input = page.getByLabel("Go to sheet");
      await input.fill(sheetId);
      await input.press("Enter");
      await page.waitForSelector(
        `[data-sheet="${sheetId}"][data-state="painted"]`,
        { timeout: SHEET_TIMEOUT_MS },
      );
    } catch (error) {
      failure = crashed
        ? "tab crashed"
        : `did not paint within ${SHEET_TIMEOUT_MS} ms`;
      console.log(`    sheet ${i + 1} (${sheetId}) — ${failure}`);
    }

    const msToPaint = failure ? null : Date.now() - startedAt;

    let frames = { p95Ms: 0, worstMs: 0, frames: 0 };
    if (!failure && !crashed) {
      await startFrameRecording(page);
      await panAndZoom(page);
      frames = await stopFrameRecording(page);
    }

    const jsHeapMb = crashed ? 0 : (await readHeapBytes(client)) / 1024 / 1024;
    const longTasks = crashed
      ? { totalMs: 0, longestMs: 0, count: 0 }
      : await readLongTasks(page);
    const attr = async (name: string) => attrOf(page, name);
    /* fullpage holds rasterized pages, tiled holds decoded tiles. Different
       units, same question: how much is being kept. */
    const pagesHeld = crashed
      ? 0
      : (await attr("data-pages-held")) || (await attr("data-tiles-held"));
    /* Canvas pixels, reported by the renderer. They sit outside the JS heap, so
       no sampled metric counts them — and for this renderer they are the memory
       that matters. */
    const pixelMemoryMb = crashed ? 0 : await attr("data-pixels-mb");
    const hits = crashed ? 0 : await attr("data-hits");
    const misses = crashed ? 0 : await attr("data-misses");

    const reading: SheetReading = {
      ordinal: i + 1,
      sheetId,
      msToPaint,
      jsHeapMb: Math.round(jsHeapMb * 10) / 10,
      pixelMemoryMb,
      pagesHeld,
      hits,
      misses,
      mainThreadBlockedMs: longTasks.totalMs,
      frameP95Ms: frames.p95Ms,
      frameWorstMs: frames.worstMs,
      ...(failure ? { failed: failure } : {}),
    };
    readings.push(reading);

    const totalMb = reading.jsHeapMb + reading.pixelMemoryMb;
    if (!failedAt && (failure || totalMb > MEMORY_MARKER_MB)) {
      failedAt = reading;
    }

    console.log(
      `    ${String(i + 1).padStart(3)}/${SHEETS}  ${sheetId.padEnd(7)}` +
        `${String(msToPaint ?? "—").padStart(6)} ms   ` +
        `pixels ${String(reading.pixelMemoryMb).padStart(7)} MB   ` +
        `js ${String(reading.jsHeapMb).padStart(5)} MB   ` +
        `held ${String(pagesHeld).padStart(3)}   ` +
        `worst frame ${String(frames.worstMs).padStart(5)} ms`,
    );

    if (crashed) break;
  }

  /* Returning to sheets already visited.

     A real session is not a one-way walk: people go back to the sheet they were
     just on. What that costs is a different question from what a first visit
     costs, and the difference is the entire argument for caching anything. */
  const revisits: { sheetId: string; ms: number }[] = [];
  /* The reading the pinned-coarse-tile decision turns on: of the tiles a revisit
     needed, how many were still in memory?

     Taken as a delta across the revisit phase rather than from the cumulative
     total, which is dominated by the one-way walk preceding it — every sheet in
     that walk is seen for the first time, so it can only miss. A rate over the
     whole run would describe the walk, not the revisits. */
  const tileStats = async () => ({
    hits: await attrOf(page, "data-hits"),
    misses: await attrOf(page, "data-misses"),
  });
  const beforeRevisit = crashed ? { hits: 0, misses: 0 } : await tileStats();

  if (!crashed && readings.length >= 4) {
    const sample = [0, Math.floor(readings.length / 2), readings.length - 2]
      .map((i) => readings[i]?.sheetId)
      .filter((id): id is string => Boolean(id));

    for (const sheetId of sample) {
      const startedAt = Date.now();
      try {
        const input = page.getByLabel("Go to sheet");
        await input.fill(sheetId);
        await input.press("Enter");
        await page.waitForSelector(
          `[data-sheet="${sheetId}"][data-state="painted"]`,
          { timeout: SHEET_TIMEOUT_MS },
        );
        revisits.push({ sheetId, ms: Date.now() - startedAt });
      } catch {
        // A revisit that fails is worth knowing about but does not fail the run.
      }
    }
    console.log(
      `    revisits: ${revisits.map((r) => `${r.sheetId} ${r.ms}ms`).join("  ")}`,
    );
  }

  const afterRevisit = crashed ? { hits: 0, misses: 0 } : await tileStats();
  const revisitTiles = {
    hits: afterRevisit.hits - beforeRevisit.hits,
    misses: afterRevisit.misses - beforeRevisit.misses,
  };
  const revisitNeeded = revisitTiles.hits + revisitTiles.misses;
  /* Null rather than 0 when nothing was needed. A rate with an empty
     denominator is not a measurement. */
  const revisitHitRate =
    revisitNeeded === 0
      ? null
      : Math.round((revisitTiles.hits / revisitNeeded) * 100);
  console.log(
    `    revisit tiles: ${revisitTiles.hits} resident, ` +
      `${revisitTiles.misses} fetched` +
      (revisitHitRate === null ? "" : ` — ${revisitHitRate}% hit rate`),
  );

  const painted = readings.filter((r) => r.msToPaint !== null);
  const firstTen = painted.slice(0, 10);
  const lastTen = painted.slice(-10);

  const result = {
    takenAt: new Date().toISOString(),
    profile: PROFILE.label,
    renderer: RENDERER,
    walk: WALK,
    document: "combined.pdf, 1500 pages, 41.7 MB",
    sheetsRequested: SHEETS,
    sheetsPainted: painted.length,
    crashed,
    coldStart: {
      firstSheetMs,
      documentOpenMs: documentOpenMs === null ? null : Math.round(documentOpenMs),
    },
    /* Whether it degrades is the question a session exists to answer, so the
       first ten sheets and the last ten are reported separately. One median over
       the whole run would hide exactly the trend being looked for. */
    sheetChange: {
      firstTen: summarize(firstTen.map((r) => r.msToPaint)),
      lastTen: summarize(lastTen.map((r) => r.msToPaint)),
    },
    worstFrame: {
      firstTen: summarize(firstTen.map((r) => r.frameWorstMs)),
      lastTen: summarize(lastTen.map((r) => r.frameWorstMs)),
    },
    memoryMb: {
      atSheet1: total(readings[0]),
      peak: Math.max(0, ...readings.map(total)),
      pixelsAtPeak: Math.max(0, ...readings.map((r) => r.pixelMemoryMb)),
      marker: MEMORY_MARKER_MB,
      exceededAt:
        readings.find((r) => total(r) > MEMORY_MARKER_MB)?.ordinal ?? null,
    },
    revisit: summarize(revisits.map((r) => r.ms)),
    /* Per tile needed during the revisit phase only. This is what says whether
       the pinned coarse tiles are earning the memory they hold. */
    revisitTiles: { ...revisitTiles, hitRatePercent: revisitHitRate },
    failedAt,
    readings,
    revisits,
  };

  await mkdir("perf-results", { recursive: true });
  await writeFile(
    `perf-results/viewer-session-${RENDERER}-${WALK}.json`,
    `${JSON.stringify(result, null, 2)}\n`,
  );

  console.log(
    `\n  session — ${PROFILE.label}, ${SHEETS} sheets, ${RENDERER}, ${WALK} walk`,
  );
  console.log(`    document opened in          ${result.coldStart.documentOpenMs} ms`);
  console.log(`    first sheet on screen       ${result.coldStart.firstSheetMs} ms`);
  console.log(`    sheet change, first ten     ${format(result.sheetChange.firstTen)}`);
  console.log(`    sheet change, last ten      ${format(result.sheetChange.lastTen)}`);
  console.log(`    worst frame, first ten      ${format(result.worstFrame.firstTen)}`);
  console.log(`    worst frame, last ten       ${format(result.worstFrame.lastTen)}`);
  console.log(`    memory at sheet 1           ${result.memoryMb.atSheet1} MB`);
  console.log(`    memory peak                 ${result.memoryMb.peak} MB`);
  console.log(`      of which canvas pixels    ${result.memoryMb.pixelsAtPeak} MB`);
  console.log(`    sheet revisit               ${format(result.revisit)}`);
  console.log(`    sheets painted              ${painted.length}/${SHEETS}`);
  if (result.memoryMb.exceededAt) {
    console.log(`    passes ${MEMORY_MARKER_MB} MB at sheet        ${result.memoryMb.exceededAt}`);
  }
  if (failedAt) {
    console.log(`    first failure at sheet      ${failedAt.ordinal} (${failedAt.sheetId}) — ${failedAt.failed ?? `past ${MEMORY_MARKER_MB} MB`}`);
  }
  console.log(
    `\n  written to perf-results/viewer-session-${RENDERER}-${WALK}.json\n`,
  );

  /* A session that painted nothing measured nothing. */
  expect(painted.length).toBeGreaterThan(0);

  /* The naive renderer failing any of the below is the result, not a broken
     test, so it is measured and never graded. */
  if (!isGated(RENDERER)) return;

  /* Every figure in budgets.ts was taken from a stride walk. Asserting them
     against a sequential one would grade a measurement from one experiment with
     a budget from another — the sequential walk visits neighbours, so its sheet
     change and memory curve are a different population, not a better score on
     the same one. It is measured and recorded here; gates for it get derived
     from its own readings in 2.7. */
  if (WALK !== "stride") {
    expect(
      painted.length,
      "the session did not paint every sheet",
    ).toBe(SHEETS);
    return;
  }

  expect(
    painted.length,
    "the session did not paint every sheet — see tests/perf/budgets.ts",
  ).toBe(SHEETS);
  expect(
    result.sheetChange.lastTen.median,
    "sheet change is over budget — see tests/perf/budgets.ts",
  ).toBeLessThanOrEqual(BUDGETS.session.sheetChangeMs);
  expect(
    result.revisit.median,
    "returning to a visited sheet is over budget — see tests/perf/budgets.ts",
  ).toBeLessThanOrEqual(BUDGETS.session.revisitMs);
  expect(
    result.memoryMb.peak,
    "peak memory over the session is over budget — see tests/perf/budgets.ts",
  ).toBeLessThanOrEqual(BUDGETS.session.peakMemoryMb);
  expect(
    result.worstFrame.lastTen.median,
    "worst frame late in the session is over budget — see tests/perf/budgets.ts",
  ).toBeLessThanOrEqual(BUDGETS.session.worstFrameMs);
});

/* Reads a number off the renderer's host element. Returns 0 rather than throwing
   when the attribute or the element is absent, because a crashed tab should
   still produce a readable row. */
async function attrOf(page: Page, name: string) {
  return Number(
    (await page
      .locator("[data-renderer]")
      .getAttribute(name)
      .catch(() => "0")) ?? "0",
  );
}

function total(reading?: SheetReading) {
  if (!reading) return 0;
  return Math.round((reading.jsHeapMb + reading.pixelMemoryMb) * 10) / 10;
}

import { mkdir, writeFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { panAndZoom, startFrameRecording, stopFrameRecording } from "./frames";
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
/* The first sheet has to wait for a 42 MB document over a paced link, which is
   minutes rather than seconds. Later sheets are fast, so this bound is generous
   for almost every step and only load-bearing for the first. */
const SHEET_TIMEOUT_MS = Number(process.env.PERF_SHEET_TIMEOUT ?? 420_000);

/* A marker on the memory curve, not a pass mark. The 400 MB figure in
   buildplan.md §7 was written before any code existed and nothing was measured
   to arrive at it. Recording which sheet the curve crosses it is useful;
   grading against it would be grading against an invented number. Real budgets
   get set from the optimised implementation's behaviour, with headroom, once
   there is one. */
const MEMORY_MARKER_MB = 400;

interface SheetReading {
  ordinal: number;
  sheetId: string;
  msToPaint: number | null;
  jsHeapMb: number;
  pixelMemoryMb: number;
  pagesHeld: number;
  mainThreadBlockedMs: number;
  frameP95Ms: number;
  frameWorstMs: number;
  failed?: string;
}

test("fullpage renderer — a session across the set", async ({
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

  /* Spread across the whole set rather than the first N. Consecutive sheets in
     one discipline would understate the work: a real session jumps between
     architectural, structural and mechanical, which is also what defeats any
     accidental locality in the document. */
  const stride = Math.max(1, Math.floor(all.length / SHEETS));
  const visits = Array.from({ length: SHEETS }, (_, i) => all[i * stride].sheetId);

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
  await page.goto("/?renderer=fullpage", { waitUntil: "commit" });

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
    const attr = async (name: string) =>
      Number(
        (await page
          .locator("[data-renderer]")
          .getAttribute(name)
          .catch(() => "0")) ?? "0",
      );
    const pagesHeld = crashed ? 0 : await attr("data-pages-held");
    /* Canvas pixels, reported by the renderer. They sit outside the JS heap, so
       no sampled metric counts them — and for this renderer they are the memory
       that matters. */
    const pixelMemoryMb = crashed ? 0 : await attr("data-pixels-mb");

    const reading: SheetReading = {
      ordinal: i + 1,
      sheetId,
      msToPaint,
      jsHeapMb: Math.round(jsHeapMb * 10) / 10,
      pixelMemoryMb,
      pagesHeld,
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

  const painted = readings.filter((r) => r.msToPaint !== null);
  const firstTen = painted.slice(0, 10);
  const lastTen = painted.slice(-10);

  const result = {
    takenAt: new Date().toISOString(),
    profile: PROFILE.label,
    renderer: "fullpage",
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
    failedAt,
    readings,
  };

  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/phase1-session.json",
    `${JSON.stringify(result, null, 2)}\n`,
  );

  console.log(`\n  session — ${PROFILE.label}, ${SHEETS} sheets, fullpage`);
  console.log(`    document opened in          ${result.coldStart.documentOpenMs} ms`);
  console.log(`    first sheet on screen       ${result.coldStart.firstSheetMs} ms`);
  console.log(`    sheet change, first ten     ${format(result.sheetChange.firstTen)}`);
  console.log(`    sheet change, last ten      ${format(result.sheetChange.lastTen)}`);
  console.log(`    worst frame, first ten      ${format(result.worstFrame.firstTen)}`);
  console.log(`    worst frame, last ten       ${format(result.worstFrame.lastTen)}`);
  console.log(`    memory at sheet 1           ${result.memoryMb.atSheet1} MB`);
  console.log(`    memory peak                 ${result.memoryMb.peak} MB`);
  console.log(`      of which canvas pixels    ${result.memoryMb.pixelsAtPeak} MB`);
  console.log(`    sheets painted              ${painted.length}/${SHEETS}`);
  if (result.memoryMb.exceededAt) {
    console.log(`    passes ${MEMORY_MARKER_MB} MB at sheet        ${result.memoryMb.exceededAt}`);
  }
  if (failedAt) {
    console.log(`    first failure at sheet      ${failedAt.ordinal} (${failedAt.sheetId}) — ${failedAt.failed ?? `past ${MEMORY_MARKER_MB} MB`}`);
  }
  console.log(`\n  written to test-results/phase1-session.json\n`);

  /* A session that painted nothing measured nothing. Everything beyond that is
     recorded rather than asserted — the naive renderer failing this is the
     result, not a broken test. */
  expect(painted.length).toBeGreaterThan(0);
});

function total(reading?: SheetReading) {
  if (!reading) return 0;
  return Math.round((reading.jsHeapMb + reading.pixelMemoryMb) * 10) / 10;
}

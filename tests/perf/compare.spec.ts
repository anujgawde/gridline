import { mkdir, writeFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { COMPARE_BUDGETS } from "./budgets";
import { startFrameRecording, stopFrameRecording, sustainedPan } from "./frames";
import { format, summarize } from "./stats";
import {
  applyProfile,
  assertServerThrottled,
  collectLongTasks,
  PROFILE,
  readLongTasksSince,
} from "./throttle";

/* Compare, opened through the shell: how long until both revisions are on
   screen, how long change detection takes, whether detection blocks the
   page, and how panning paces in both modes.

   Each comparison is opened twice in one context: cold, then reloaded, so
   the second open is served from the HTTP cache (set content is
   `immutable`). Cold is mostly the throttled link; warm is the work itself.

   Spans are compare's own: `gridline:compare-shown`, from the comparison
   being asked for to every level-0 tile on screen, and
   `gridline:changes-found`, from asking for detection to the regions
   arriving. "Detecting: longest task" counts only tasks that began inside
   that second span, so it describes detection rather than the shell
   starting up.

   Panning is measured on A-131 only, after the warm open: a 60-step circle
   over the TO pane side by side, then the same in onion skin.

   Switches, each a check that a gate can fail rather than a reading:
     PERF_DETECT=main      compare's `?detect=main`: detection on the page's
                           thread. "Detecting: longest task" must trip.
     PERF_DETECT_LEVEL=3   compare's `?detectLevel=3`: four times the pixels.
                           Warm detection must trip.
     PERF_JANK=1           an 80 ms stall on every pointermove, injected
                           here. Both pans must trip.
   Each writes its own results file. Gates are graded on every run, switches
   included: a switch run is meant to go red, which is how a gate is seen to
   fail. PERF_RUNS=1 is enough for those. */

const RUNS = Number(process.env.PERF_RUNS ?? 3);
const JANK = process.env.PERF_JANK === "1";
const DETECT_MAIN = process.env.PERF_DETECT === "main";
const DETECT_LEVEL = process.env.PERF_DETECT_LEVEL ?? null;

/* A-131 is the sheet detection was first checked against by eye; the other
   three carry six edits each, the most in the set. */
const COMPARISONS = [
  { sheetId: "A-131", from: 1, to: 3 },
  { sheetId: "M-622", from: 1, to: 3 },
  { sheetId: "AD-229", from: 1, to: 3 },
  { sheetId: "M-555", from: 1, to: 3 },
] as const;

const TO_PANE = ".compare-pane-stage >> nth=-1";

function address({ sheetId, from, to }: (typeof COMPARISONS)[number]) {
  const params = new URLSearchParams({ view: "compare", sheet: sheetId, from: String(from), to: String(to) });
  if (DETECT_MAIN) params.set("detect", "main");
  if (DETECT_LEVEL) params.set("detectLevel", DETECT_LEVEL);
  return `/?${params}`;
}

/* Waits for both spans, then reads them and the long tasks inside detection. */
async function readOpen(page: Page) {
  await page.waitForFunction(
    () =>
      performance.getEntriesByName("gridline:compare-shown", "measure").length > 0 &&
      performance.getEntriesByName("gridline:changes-found", "measure").length > 0,
    undefined,
    { timeout: 120_000 },
  );
  const spans = await page.evaluate(() => {
    const shown = performance.getEntriesByName("gridline:compare-shown", "measure")[0]!;
    const found = performance.getEntriesByName("gridline:changes-found", "measure")[0] as PerformanceMeasure;
    return {
      shownMs: shown.duration,
      foundMs: found.duration,
      foundStart: found.startTime,
      regions: (found.detail as { regions: unknown[] }).regions.length,
    };
  });
  const detecting = await readLongTasksSince(page, spans.foundStart, spans.foundStart + spans.foundMs);
  return {
    shownMs: Math.round(spans.shownMs),
    foundMs: Math.round(spans.foundMs),
    regions: spans.regions,
    detectLongestTaskMs: detecting.longestMs,
  };
}

async function measurePan(page: Page) {
  const start = await page.evaluate(() => performance.now());
  await startFrameRecording(page);
  await sustainedPan(page, 60, TO_PANE);
  const frames = await stopFrameRecording(page);
  const tasks = await readLongTasksSince(page, start);
  return { frameP95Ms: frames.p95Ms, frameWorstMs: frames.worstMs, frames: frames.frames, longestTaskMs: tasks.longestMs };
}

test("compare — open, detect and pan", async ({ browser, request }) => {
  test.setTimeout(900_000);
  const throttle = await assertServerThrottled((url) => request.get(url));

  const samples: {
    sheetId: string;
    run: number;
    regions: number;
    coldShownMs: number;
    coldFoundMs: number;
    coldDetectLongestTaskMs: number;
    warmShownMs: number;
    warmFoundMs: number;
    warmDetectLongestTaskMs: number;
  }[] = [];
  const pans: { side: Awaited<ReturnType<typeof measurePan>>; onion: Awaited<ReturnType<typeof measurePan>> }[] = [];

  for (let run = 0; run < RUNS; run += 1) {
    for (const comparison of COMPARISONS) {
      const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      const page = await context.newPage();
      await collectLongTasks(page);
      await applyProfile(page);

      await page.goto(address(comparison), { waitUntil: "commit" });
      const cold = await readOpen(page);
      await page.reload({ waitUntil: "commit" });
      const warm = await readOpen(page);

      samples.push({
        sheetId: comparison.sheetId,
        run: run + 1,
        regions: warm.regions,
        coldShownMs: cold.shownMs,
        coldFoundMs: cold.foundMs,
        coldDetectLongestTaskMs: cold.detectLongestTaskMs,
        warmShownMs: warm.shownMs,
        warmFoundMs: warm.foundMs,
        warmDetectLongestTaskMs: warm.detectLongestTaskMs,
      });
      console.log(
        `    run ${run + 1}/${RUNS} ${comparison.sheetId}  ${warm.regions} changes  ` +
          `cold shown ${cold.shownMs} / found ${cold.foundMs} ms  ` +
          `warm shown ${warm.shownMs} / found ${warm.foundMs} ms  ` +
          `detect longest task ${cold.detectLongestTaskMs} / ${warm.detectLongestTaskMs} ms`,
      );

      if (comparison.sheetId === "A-131") {
        // Let the warm open's last tiles land before anything is timed.
        await page.waitForTimeout(1000);
        if (JANK) {
          await page.evaluate(() => {
            document.addEventListener("pointermove", () => {
              const start = performance.now();
              while (performance.now() - start < 80) {
                /* stall */
              }
            });
          });
        }
        const side = await measurePan(page);
        await page.keyboard.press("o");
        await page.waitForTimeout(1500);
        const onion = await measurePan(page);
        pans.push({ side, onion });
        console.log(
          `    run ${run + 1}/${RUNS} pan  side p95 ${side.frameP95Ms} / worst ${side.frameWorstMs} ms  ` +
            `onion p95 ${onion.frameP95Ms} / worst ${onion.frameWorstMs} ms`,
        );
      }

      await context.close();
    }
  }

  const pick = (key: keyof (typeof samples)[number]) => summarize(samples.map((s) => s[key] as number));
  const pickPan = (mode: "side" | "onion", key: keyof (typeof pans)[number]["side"]) =>
    summarize(pans.map((p) => p[mode][key]));

  const result = {
    takenAt: new Date().toISOString(),
    profile: PROFILE.label,
    throttle,
    runs: RUNS,
    switches: { detect: DETECT_MAIN ? "main" : "worker", detectLevel: DETECT_LEVEL, jank: JANK },
    comparisons: COMPARISONS,
    cold: { shown: pick("coldShownMs"), found: pick("coldFoundMs"), detectLongestTask: pick("coldDetectLongestTaskMs") },
    warm: { shown: pick("warmShownMs"), found: pick("warmFoundMs"), detectLongestTask: pick("warmDetectLongestTaskMs") },
    pan: {
      side: { frameP95: pickPan("side", "frameP95Ms"), frameWorst: pickPan("side", "frameWorstMs"), longestTask: pickPan("side", "longestTaskMs") },
      onion: { frameP95: pickPan("onion", "frameP95Ms"), frameWorst: pickPan("onion", "frameWorstMs"), longestTask: pickPan("onion", "longestTaskMs") },
    },
    samples,
    pans,
  };

  /* One file per switch, so a check on the spec never replaces a reading. */
  const suffix = [DETECT_MAIN && "detect-main", DETECT_LEVEL && `level-${DETECT_LEVEL}`, JANK && "jank"]
    .filter(Boolean)
    .join("-");
  const file = `compare${suffix ? `-${suffix}` : ""}.json`;
  await mkdir("perf-results", { recursive: true });
  await writeFile(`perf-results/${file}`, `${JSON.stringify(result, null, 2)}\n`);

  console.log(`\n  compare — ${PROFILE.label}, ${RUNS} runs × ${COMPARISONS.length} comparisons${suffix ? `, ${suffix}` : ""}`);
  console.log(`    cold: both shown          ${format(result.cold.shown)}`);
  console.log(`    cold: changes found       ${format(result.cold.found)}`);
  console.log(`    cold: detect longest task ${format(result.cold.detectLongestTask)}`);
  console.log(`    warm: both shown          ${format(result.warm.shown)}`);
  console.log(`    warm: changes found       ${format(result.warm.found)}`);
  console.log(`    warm: detect longest task ${format(result.warm.detectLongestTask)}`);
  console.log(`    pan side:  frame p95      ${format(result.pan.side.frameP95)}`);
  console.log(`    pan side:  frame worst    ${format(result.pan.side.frameWorst)}`);
  console.log(`    pan onion: frame p95      ${format(result.pan.onion.frameP95)}`);
  console.log(`    pan onion: frame worst    ${format(result.pan.onion.frameWorst)}`);
  console.log(`\n  written to perf-results/${file}\n`);

  // A comparison that found nothing measured an empty diff, not detection.
  expect(samples.every((s) => s.regions > 0)).toBe(true);
  expect(pans.every((p) => p.side.frames > 0 && p.onion.frames > 0)).toBe(true);

  const gate = COMPARE_BUDGETS;
  const worst = (key: "coldDetectLongestTaskMs" | "warmDetectLongestTaskMs") =>
    Math.max(...samples.map((s) => s[key]));
  expect.soft(result.cold.shown.median!, "cold: both revisions shown over budget").toBeLessThanOrEqual(gate.open.coldShownMs);
  expect.soft(result.cold.found.median!, "cold: changes found over budget").toBeLessThanOrEqual(gate.open.coldFoundMs);
  expect.soft(result.warm.found.median!, "warm: changes found over budget").toBeLessThanOrEqual(gate.open.warmFoundMs);
  expect.soft(worst("coldDetectLongestTaskMs"), "detection blocked the page (cold) — is it still in the worker?").toBeLessThanOrEqual(gate.open.detectLongestTaskMs);
  expect.soft(worst("warmDetectLongestTaskMs"), "detection blocked the page (warm) — is it still in the worker?").toBeLessThanOrEqual(gate.open.detectLongestTaskMs);
  expect.soft(result.pan.side.frameP95.median!, "side-by-side pan frame p95 over budget").toBeLessThanOrEqual(gate.pan.sideFrameP95Ms);
  expect.soft(result.pan.onion.frameP95.median!, "onion pan frame p95 over budget").toBeLessThanOrEqual(gate.pan.onionFrameP95Ms);
});

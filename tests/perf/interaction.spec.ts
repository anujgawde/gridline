import { mkdir, writeFile } from "node:fs/promises";

import type { CDPSession, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
  pinch,
  startFrameRecording,
  stopFrameRecording,
  sustainedPan,
} from "./frames";
import type { PinchMode } from "./frames";
import {
  armLatency,
  installLatencyInstrument,
  readLatency,
} from "./input-latency";
import { BUDGETS, isGated } from "./budgets";
import { format, summarize } from "./stats";
import {
  applyProfile,
  assertServerThrottled,
  collectLongTasks,
  PROFILE,
  readLongTasksSince,
} from "./throttle";

/* What a gesture costs, once a sheet is already on screen.

   The other two specs measure navigation — opening a document, changing sheets,
   walking a session. Neither touches interaction, because until the gesture
   layer existed there was no pinch to measure and panning was a single-pointer
   drag nobody claimed anything about.

   Three scenarios, because one gesture does not answer one question:

     - `pan`, a long circular drag. The scale never changes, so no tile is ever
       requested and this is the input path on its own.
     - `zoomSteady`, a pinch swinging in and out inside one band of scale. The
       tiles are already decoded, so this is what the gesture costs when the
       renderer has nothing new to fetch.
     - `zoomDeepening`, a pinch that grows the whole way into levels that have
       not been fetched. This is what someone does to read a detail, and it
       carries tile requests and decodes on top of the gesture.

   Measuring only one of the last two would make the result an artefact of how
   the fingers happened to move: the same spec, with the same budget, reads very
   differently depending on whether the zoom stayed inside the cache. The gap
   between them is the finding, so both are recorded.

   Gated against budgets.ts, which holds these same measurements plus headroom.
   `fullpage` is measured and never graded: it ships permanently so the
   comparison stays a URL anyone can open, and it fails all of this by
   construction. */

const RUNS = Number(process.env.PERF_RUNS ?? 5);
const SHEET_ID = process.env.PERF_SHEET ?? "A-101";
const RENDERER = process.env.PERF_RENDERER ?? "tiled";
const SHEET_TIMEOUT_MS = Number(process.env.PERF_SHEET_TIMEOUT ?? 420_000);

const ORIGINS = {
  shell: "http://localhost:4100",
  viewer: "http://localhost:4101/remoteEntry.js",
  sheets: "http://localhost:4200/sheet-index.json",
};

interface Reading {
  /* How many input-to-paint pairs the settle instrument produced. A percentile
     over few samples is a percentile in name only, so the count travels with
     them. Zero for `pan`, correctly: panning never changes the scale, so the
     attribute the settle instrument watches never changes. Event timing still
     reports, because that watches the events themselves. */
  settleSamples: number;
  eventTimingMedianMs: number | null;
  eventTimingP95Ms: number | null;
  eventTimingWorstMs: number | null;
  settleMedianMs: number | null;
  settleP95Ms: number | null;
  settleWorstMs: number | null;
  frameP95Ms: number;
  frameWorstMs: number;
  frames: number;
  blockedMs: number;
  longestTaskMs: number;
}

type Sample = Record<"pan" | "zoomSteady" | "zoomDeepening", Reading>;

const percentile = (values: number[], p: number): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return Math.round(sorted[index] ?? 0);
};

/* One scenario, measured end to end. Frames and latency are recorded over the
   same gesture rather than over two, so they describe one event rather than two
   that happened to be similar. */
async function measure(
  page: Page,
  gesture: () => Promise<void>,
): Promise<Reading> {
  const startedAt = await page.evaluate(() => performance.now());

  await armLatency(page);
  await startFrameRecording(page);
  await gesture();
  const frames = await stopFrameRecording(page);

  /* The last move's paint has not necessarily landed when dispatch returns. */
  await page.waitForTimeout(500);

  const latency = await readLatency(page);
  const blocked = await readLongTasksSince(page, startedAt);

  return {
    settleSamples: latency.settleMs.length,
    eventTimingMedianMs: percentile(latency.eventTimingMs, 0.5),
    eventTimingP95Ms: percentile(latency.eventTimingMs, 0.95),
    eventTimingWorstMs: percentile(latency.eventTimingMs, 1),
    settleMedianMs: percentile(latency.settleMs, 0.5),
    settleP95Ms: percentile(latency.settleMs, 0.95),
    settleWorstMs: percentile(latency.settleMs, 1),
    frameP95Ms: frames.p95Ms,
    frameWorstMs: frames.worstMs,
    frames: frames.frames,
    blockedMs: blocked.totalMs,
    longestTaskMs: blocked.longestMs,
  };
}

/* Back to the framed view between scenarios, through the viewer's own control.
   Without it `zoomDeepening` would start from wherever the previous gesture
   left the scale, and "deepening" would mean something different on every run. */
async function reframe(page: Page) {
  await page.getByRole("button", { name: "Fit sheet", exact: true }).click();
  await page.waitForTimeout(400);
}

const pinchWith = (page: Page, client: CDPSession, mode: PinchMode, steps: number) =>
  () => pinch(page, client, { mode, steps });

test.beforeAll(async ({ request }) => {
  for (const [name, url] of Object.entries(ORIGINS)) {
    const response = await request.get(url).catch(() => null);
    expect(
      response?.ok(),
      `${name} is not being served at ${url}. Run \`pnpm build && pnpm serve\` first — these numbers are only meaningful against a static server, never the dev server.`,
    ).toBe(true);
  }
  await assertServerThrottled((url) => request.get(url));
});

test(`${RENDERER} renderer — interaction, ${RUNS} runs`, async ({ browser }) => {
  test.setTimeout(RUNS * 480_000);

  const samples: Sample[] = [];

  for (let run = 0; run < RUNS; run += 1) {
    /* hasTouch, because the pinch is dispatched as touch over CDP. A
       PointerEvent built in page script is untrusted and the Event Timing API
       drops those, so a faked pinch yields a working gesture and no data. */
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      hasTouch: true,
    });
    const page = await context.newPage();

    await collectLongTasks(page);
    await installLatencyInstrument(page);
    const client = await applyProfile(page);

    await page.goto(
      `http://localhost:4100/?renderer=${RENDERER}&sheet=${SHEET_ID}`,
      { waitUntil: "commit" },
    );
    await page.waitForSelector(
      `[data-sheet="${SHEET_ID}"][data-state="painted"]`,
      { timeout: SHEET_TIMEOUT_MS },
    );

    const pan = await measure(page, () => sustainedPan(page));
    await reframe(page);

    const zoomSteady = await measure(page, pinchWith(page, client, "oscillate", 60));
    await reframe(page);

    const zoomDeepening = await measure(page, pinchWith(page, client, "expand", 50));

    samples.push({ pan, zoomSteady, zoomDeepening });

    console.log(
      `    run ${run + 1}/${RUNS}  pan worst ${pan.frameWorstMs} ms  ` +
        `steady settle p95 ${zoomSteady.settleP95Ms ?? "—"} ms  ` +
        `deepening settle p95 ${zoomDeepening.settleP95Ms ?? "—"} ms  ` +
        `deepening blocked ${zoomDeepening.blockedMs} ms`,
    );
    await context.close();
  }

  const scenarios = ["pan", "zoomSteady", "zoomDeepening"] as const;
  const metrics = Object.fromEntries(
    scenarios.map((scenario) => [
      scenario,
      Object.fromEntries(
        (Object.keys(samples[0]![scenario]) as (keyof Reading)[]).map((key) => [
          key,
          summarize(samples.map((s) => s[scenario][key])),
        ]),
      ),
    ]),
  );

  const reading = {
    takenAt: new Date().toISOString(),
    profile: PROFILE.label,
    renderer: RENDERER,
    sheetId: SHEET_ID,
    runs: RUNS,
    metrics,
    samples,
  };

  await mkdir("test-results", { recursive: true });
  await writeFile(
    `test-results/viewer-interaction-${RENDERER}.json`,
    `${JSON.stringify(reading, null, 2)}\n`,
  );

  console.log(
    `\n  interaction — ${PROFILE.label}, ${SHEET_ID}, ${RENDERER}, median of ${RUNS}`,
  );
  for (const scenario of scenarios) {
    console.log(`\n    ${scenario}`);
    for (const [key, stat] of Object.entries(metrics[scenario]!)) {
      const unit =
        key === "frames" ? "frames" : key === "settleSamples" ? "samples" : "ms";
      console.log(`      ${key.padEnd(22)} ${format(stat, unit)}`);
    }
  }
  console.log(
    `\n  written to test-results/viewer-interaction-${RENDERER}.json\n`,
  );

  /* The only assertions: the gestures actually ran and were actually observed.
     A run where the pinch moved nothing, or where no frame was recorded, would
     otherwise write a file of zeroes that reads like a fast result. */
  expect(
    metrics.pan!.frames!.median,
    "no frames recorded during the pan — the gesture did not run",
  ).toBeGreaterThan(10);
  for (const scenario of ["zoomSteady", "zoomDeepening"] as const) {
    expect(
      metrics[scenario]!.settleSamples!.median,
      `${scenario} produced no paint — the pinch did not reach the renderer`,
    ).toBeGreaterThan(5);
  }

  if (!isGated(RENDERER)) return;

  const gate = (
    scenario: keyof typeof BUDGETS.interaction,
    key: string,
    limit: number,
  ) =>
    expect(
      metrics[scenario]![key]!.median,
      `${scenario}.${key} is over budget — see tests/perf/budgets.ts`,
    ).toBeLessThanOrEqual(limit);

  gate("pan", "frameWorstMs", BUDGETS.interaction.pan.frameWorstMs);
  gate("pan", "blockedMs", BUDGETS.interaction.pan.blockedMs);

  gate("zoomSteady", "settleP95Ms", BUDGETS.interaction.zoomSteady.settleP95Ms);
  gate("zoomSteady", "frameWorstMs", BUDGETS.interaction.zoomSteady.frameWorstMs);
  gate("zoomSteady", "blockedMs", BUDGETS.interaction.zoomSteady.blockedMs);

  gate("zoomDeepening", "settleP95Ms", BUDGETS.interaction.zoomDeepening.settleP95Ms);
  gate("zoomDeepening", "frameWorstMs", BUDGETS.interaction.zoomDeepening.frameWorstMs);
  gate("zoomDeepening", "blockedMs", BUDGETS.interaction.zoomDeepening.blockedMs);
});

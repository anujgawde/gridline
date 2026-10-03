import { mkdir, writeFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { format, summarize } from "./stats";
import { applyProfile, PROFILE, readHeapBytes } from "./throttle";

/* The navigator's unoptimised grid: 1,500 DOM cards, no virtualisation. This
   records the cost of scrolling the whole list, top to bottom, as the reading
   a virtualised grid is compared against.

   Frames come from a CDP trace, not requestAnimationFrame, and the event read
   is DrawFrame — a frame the compositor actually drew. BeginFrame looks like
   the obvious choice and is useless: it is the vsync tick, emitted whether or
   not a frame followed, so it reads 16.7 ms through an 80 ms main-thread stall.

   Scrolling is compositor-driven, so a busy main thread rarely drops a frame
   here; it shows up instead as main-thread rendering time. Both are recorded,
   because they answer different questions — what the user sees, and what the
   page costs to keep it that way.

   PERF_JANK=1 stalls the main thread 80 ms on every scroll event. It exists to
   confirm the spec can see a regression: both readings must move under it.

   No gates. This is the baseline; gates are set from it. */

const RUNS = Number(process.env.PERF_RUNS ?? 3);
const JANK = process.env.PERF_JANK === "1";

/* One-and-a-half refresh intervals at 60 Hz. A frame longer than this is one
   the display had to repeat. */
const LONG_FRAME_MS = 25;

/* Steady and quick, so the whole list passes in about 15 seconds. */
const SCROLL_SPEED_PX_S = 3000;

/* Main-thread rendering work, by trace event name. These are siblings in the
   frame lifecycle rather than nested, so their durations sum without
   double-counting. EventDispatch carries scroll handlers. */
const MAIN_THREAD_EVENTS = new Set([
  "EventDispatch",
  "UpdateLayoutTree",
  "Layout",
  "PrePaint",
  "Paint",
  "Layerize",
]);

interface TraceEvent {
  name?: string;
  ts?: number;
  dur?: number;
}

test("navigator grid — scroll performance", async ({ browser }) => {
  test.setTimeout(300_000);

  const samples: {
    domNodes: number;
    jsHeapMb: number;
    frameCount: number;
    frameMedianMs: number;
    frameP95Ms: number;
    frameWorstMs: number;
    longFrames: number;
    mainThreadMs: number;
  }[] = [];

  for (let run = 0; run < RUNS; run += 1) {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
    });
    const page = await context.newPage();
    const client = await applyProfile(page);

    await page.goto("/?view=sheets", { waitUntil: "commit" });

    /* The grid writes the count only once the sheets are rendered, so this
       confirms every card is in the DOM. */
    await page.waitForFunction(
      () => Number(document.querySelector("[data-sheet-count]")?.getAttribute("data-sheet-count")) > 0,
      undefined,
      { timeout: 60_000 },
    );
    await page.waitForTimeout(500);

    const domNodes = await page.evaluate(() => document.querySelectorAll("*").length);
    const jsHeapMb = (await readHeapBytes(client)) / 1024 / 1024;

    if (JANK) {
      await page.evaluate(() => {
        document.querySelector(".sheet-grid")?.addEventListener("scroll", () => {
          const start = performance.now();
          while (performance.now() - start < 80) {
            /* stall */
          }
        });
      });
    }

    const grid = page.locator(".sheet-grid");
    const box = await grid.boundingBox();
    if (!box) throw new Error(".sheet-grid not visible");
    const distance = await grid.evaluate((el) => el.scrollHeight - el.clientHeight);

    /* Both listeners attach before tracing starts. Attached after Tracing.end,
       a short trace can complete first and the wait never resolves. */
    const chunks: TraceEvent[][] = [];
    client.on("Tracing.dataCollected", (params) => {
      chunks.push((params as { value: TraceEvent[] }).value);
    });
    const complete = new Promise<void>((resolve) => {
      client.once("Tracing.tracingComplete", () => resolve());
    });

    await client.send("Tracing.start", {
      categories: "disabled-by-default-devtools.timeline.frame,devtools.timeline",
    });

    /* Chrome's own gesture synthesiser, generating wheel input inside the
       browser at display rate. Wheel events sent one at a time from the test
       are paced by the protocol round trip instead, and the idle gaps between
       them read as slow frames even with no throttling at all. */
    await client.send("Input.synthesizeScrollGesture", {
      x: Math.round(box.x + box.width / 2),
      y: Math.round(box.y + box.height / 2),
      yDistance: -distance,
      speed: SCROLL_SPEED_PX_S,
      gestureSourceType: "mouse",
    });

    await client.send("Tracing.end");
    await complete;

    /* A scroll that stopped short measured part of the list. */
    const scrollTop = await grid.evaluate((el) => el.scrollTop);
    expect(scrollTop).toBeGreaterThanOrEqual(distance - 1);

    const events = chunks.flat();

    const drawn = events
      .filter((e) => e.name === "DrawFrame" && typeof e.ts === "number")
      .map((e) => e.ts as number)
      .sort((a, b) => a - b);

    /* Trace timestamps are in microseconds. No interval is discarded: the
       gesture keeps the compositor busy throughout, so a long one is a frame
       the user saw repeated, not idle time. */
    const intervals: number[] = [];
    for (let i = 1; i < drawn.length; i += 1) {
      intervals.push((drawn[i]! - drawn[i - 1]!) / 1000);
    }
    const sorted = [...intervals].sort((a, b) => a - b);
    const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;

    const mainThreadMs =
      events
        .filter((e) => e.name && MAIN_THREAD_EVENTS.has(e.name) && typeof e.dur === "number")
        .reduce((sum, e) => sum + (e.dur as number), 0) / 1000;

    const sample = {
      domNodes,
      jsHeapMb: Math.round(jsHeapMb * 10) / 10,
      frameCount: intervals.length,
      frameMedianMs: Math.round(at(0.5) * 10) / 10,
      frameP95Ms: Math.round(at(0.95) * 10) / 10,
      frameWorstMs: Math.round((sorted[sorted.length - 1] ?? 0) * 10) / 10,
      longFrames: intervals.filter((ms) => ms > LONG_FRAME_MS).length,
      mainThreadMs: Math.round(mainThreadMs),
    };
    samples.push(sample);

    console.log(
      `    run ${run + 1}/${RUNS}  ` +
        `DOM ${sample.domNodes}  ` +
        `heap ${Math.round(jsHeapMb)} MB  ` +
        `frames ${sample.frameCount}  ` +
        `p95 ${sample.frameP95Ms} ms  ` +
        `worst ${sample.frameWorstMs} ms  ` +
        `long ${sample.longFrames}  ` +
        `main thread ${sample.mainThreadMs} ms`,
    );

    await context.close();
  }

  const pick = (key: keyof (typeof samples)[0]) => summarize(samples.map((s) => s[key]));

  const result = {
    takenAt: new Date().toISOString(),
    profile: PROFILE.label,
    runs: RUNS,
    jank: JANK,
    scrollSpeedPxPerS: SCROLL_SPEED_PX_S,
    dom: { nodes: pick("domNodes") },
    memory: { jsHeapMb: pick("jsHeapMb") },
    scroll: {
      frames: pick("frameCount"),
      frameMedian: pick("frameMedianMs"),
      frameP95: pick("frameP95Ms"),
      frameWorst: pick("frameWorstMs"),
      longFrames: pick("longFrames"),
      mainThread: pick("mainThreadMs"),
    },
    samples,
  };

  /* A jank run is a check on the spec, not a reading of the grid, so it must
     not overwrite the baseline. */
  const file = JANK ? "navigator-scroll-jank.json" : "navigator-scroll.json";
  await mkdir("perf-results", { recursive: true });
  await writeFile(`perf-results/${file}`, `${JSON.stringify(result, null, 2)}\n`);

  console.log(
    `\n  navigator grid scroll — ${PROFILE.label}, median of ${RUNS}${JANK ? ", JANK INJECTED" : ""}`,
  );
  console.log(`    DOM nodes               ${format(result.dom.nodes, "")}`);
  console.log(`    JS heap                 ${format(result.memory.jsHeapMb, "MB")}`);
  console.log(`    frames drawn            ${format(result.scroll.frames, "")}`);
  console.log(`    frame median            ${format(result.scroll.frameMedian)}`);
  console.log(`    frame p95               ${format(result.scroll.frameP95)}`);
  console.log(`    frame worst             ${format(result.scroll.frameWorst)}`);
  console.log(`    frames > ${LONG_FRAME_MS} ms           ${format(result.scroll.longFrames, "")}`);
  console.log(`    main-thread rendering   ${format(result.scroll.mainThread)}`);
  console.log(`\n  written to perf-results/${file}\n`);

  expect(samples.every((s) => s.frameCount > 0)).toBe(true);
});

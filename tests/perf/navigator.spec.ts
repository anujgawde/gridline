import { mkdir, writeFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { LONG_FRAME_MS, traceScroll } from "./scroll-trace";
import { format, summarize } from "./stats";
import {
  applyProfile,
  collectLongTasks,
  PROFILE,
  readHeapBytes,
  readLongTasks,
} from "./throttle";

/* The navigator's sheet grid, loaded and then scrolled top to bottom.

   PERF_GRID=full measures the baseline, every one of the 1,500 cards in the DOM
   (`?grid=full`). The default measures the virtual grid, which draws only the
   rows near the viewport. Each writes its own results file.

   First render is the navigator's own `gridline:grid-shown` span, from the
   sheet index arriving to the grid painted, so network time is not in it.

   Thumbnails are switched off (`?thumbs=0`): this spec measures the grid, and
   images downloading and decoding underneath it would make the virtual grid's
   reading describe something the full grid never does. Their cost is measured
   on its own in thumbnails.spec.ts.

   Frames and main-thread time come from a CDP trace; scroll-trace.ts says why
   that trace, and why DrawFrame.

   PERF_JANK=1 stalls the main thread 80 ms on every scroll event. It exists to
   confirm the spec can see a regression: both readings must move under it.

   No gates. This is the baseline; gates are set from it. */

const RUNS = Number(process.env.PERF_RUNS ?? 3);
const JANK = process.env.PERF_JANK === "1";
const GRID = process.env.PERF_GRID === "full" ? "full" : "virtual";

/* Steady and quick, so the whole list passes in about 15 seconds. */
const SCROLL_SPEED_PX_S = 3000;

test(`navigator grid (${GRID}) — load and scroll`, async ({ browser }) => {
  test.setTimeout(300_000);

  const samples: {
    gridShownMs: number | null;
    loadLongestTaskMs: number;
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
    await collectLongTasks(page);
    const client = await applyProfile(page);

    await page.goto(`/?view=sheets&thumbs=0${GRID === "full" ? "&grid=full" : ""}`, {
      waitUntil: "commit",
    });

    /* The grid writes the count only once the sheets are rendered, so this
       confirms every card is in the DOM. */
    await page.waitForFunction(
      () => Number(document.querySelector("[data-sheet-count]")?.getAttribute("data-sheet-count")) > 0,
      undefined,
      { timeout: 60_000 },
    );
    await page.waitForTimeout(500);

    /* A grid of the wrong kind would make every reading below describe the
       other one. */
    await expect(page.locator(`.sheet-grid-${GRID}`)).toHaveCount(1);

    const gridShownMs = await page.evaluate(
      () => performance.getEntriesByName("gridline:grid-shown", "measure")[0]?.duration ?? null,
    );
    /* Read before scrolling, so it covers loading only. The longest task is
       usually the grid's own render, but it is whatever blocked the page most
       while it loaded. */
    const loadLongestTaskMs = (await readLongTasks(page)).longestMs;

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

    const scroll = await traceScroll(
      client,
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      distance,
      SCROLL_SPEED_PX_S,
    );

    /* A scroll that stopped short measured part of the list. */
    const scrollTop = await grid.evaluate((el) => el.scrollTop);
    expect(scrollTop).toBeGreaterThanOrEqual(distance - 1);

    const sample = {
      gridShownMs: gridShownMs === null ? null : Math.round(gridShownMs),
      loadLongestTaskMs,
      domNodes,
      jsHeapMb: Math.round(jsHeapMb * 10) / 10,
      ...scroll,
    };
    samples.push(sample);

    console.log(
      `    run ${run + 1}/${RUNS}  ` +
        `shown ${sample.gridShownMs} ms  ` +
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
    grid: GRID,
    jank: JANK,
    scrollSpeedPxPerS: SCROLL_SPEED_PX_S,
    load: {
      gridShown: pick("gridShownMs"),
      longestTask: pick("loadLongestTaskMs"),
    },
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

  /* One file per grid, so measuring one never replaces the other's reading. A
     jank run is a check on the spec, not a reading of the grid, so it gets its
     own file too. */
  const file = `navigator-scroll-${GRID}${JANK ? "-jank" : ""}.json`;
  await mkdir("perf-results", { recursive: true });
  await writeFile(`perf-results/${file}`, `${JSON.stringify(result, null, 2)}\n`);

  console.log(
    `\n  navigator grid (${GRID}) — ${PROFILE.label}, median of ${RUNS}${JANK ? ", JANK INJECTED" : ""}`,
  );
  console.log(`    grid shown              ${format(result.load.gridShown)}`);
  console.log(`    load: longest task      ${format(result.load.longestTask)}`);
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
  expect(samples.every((s) => s.gridShownMs !== null)).toBe(true);
});

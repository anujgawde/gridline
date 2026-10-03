import { mkdir, writeFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { LONG_FRAME_MS, traceScroll } from "./scroll-trace";
import { format, summarize } from "./stats";
import { applyProfile, PROFILE, readHeapBytes } from "./throttle";

/* What thumbnails cost the navigator's virtual grid: how long a screenful
   takes to fill, and whether scrolling holds its frame rate while they arrive
   and decode.

   PERF_THUMBS=0 runs the same walk with thumbnails off (`?thumbs=0`). The
   difference between the two is what thumbnails add; neither is graded.

   The slow scroll is the one that answers the frame-rate question. A fast
   scroll passes cards before their thumbnails could arrive and withdraws the
   requests, so almost nothing decodes during it. At reading pace thumbnails
   land mid-scroll, and the spec counts how many did — a run in which none
   arrived would have measured a scroll with nothing to decode. */

const RUNS = Number(process.env.PERF_RUNS ?? 3);
const THUMBS = process.env.PERF_THUMBS !== "0";

/* About two card rows a second. */
const SLOW_SPEED_PX_S = 400;
const SLOW_VIEWPORTS = 4;

/* Resolves to the page's clock once every card thumbnail intersecting the
   grid's viewport has loaded. */
async function screenFilled(page: Page): Promise<number> {
  const handle = await page.waitForFunction(
    () => {
      const grid = document.querySelector(".sheet-grid")?.getBoundingClientRect();
      if (!grid) return false;
      const onScreen = [...document.querySelectorAll(".sheet-grid-placed .sheet-card-thumb")].filter(
        (thumb) => {
          const box = thumb.getBoundingClientRect();
          return box.bottom > grid.top && box.top < grid.bottom;
        },
      );
      const filled =
        onScreen.length > 0 &&
        onScreen.every((thumb) => (thumb as HTMLElement).dataset.thumb === "loaded");
      return filled ? performance.now() : false;
    },
    undefined,
    { polling: "raf", timeout: 120_000 },
  );
  return (await handle.jsonValue()) as number;
}

test(`navigator thumbnails (${THUMBS ? "on" : "off"}) — first screen and a slow scroll`, async ({
  browser,
}) => {
  test.setTimeout(600_000);

  const samples: {
    screenfulMs: number | null;
    scrollBackMs: number | null;
    thumbnailsDuringScroll: number;
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

    await page.goto(`/?view=sheets${THUMBS ? "" : "&thumbs=0"}`, { waitUntil: "commit" });
    await page.waitForFunction(
      () => Number(document.querySelector("[data-sheet-count]")?.getAttribute("data-sheet-count")) > 0,
      undefined,
      { timeout: 60_000 },
    );
    await expect(page.locator(".sheet-grid-virtual")).toHaveCount(1);

    /* From the grid painted, so the sheet index's own download is not in it —
       that is the same with or without thumbnails. */
    let screenfulMs: number | null = null;
    if (THUMBS) {
      const filledAt = await screenFilled(page);
      const gridShownAt = await page.evaluate(() => {
        const measure = performance.getEntriesByName("gridline:grid-shown", "measure")[0];
        return measure ? measure.startTime + measure.duration : null;
      });
      if (gridShownAt === null) throw new Error("gridline:grid-shown was never measured");
      screenfulMs = Math.round(filledAt - gridShownAt);
    }
    await page.waitForTimeout(500);
    const jsHeapMb = (await readHeapBytes(client)) / 1024 / 1024;

    const grid = page.locator(".sheet-grid");
    const box = await grid.boundingBox();
    if (!box) throw new Error(".sheet-grid not visible");
    const distance = Math.round(box.height * SLOW_VIEWPORTS);

    /* Every card that changes to "loaded" while the scroll runs. A card that
       scrolls back into the drawn range starts again from idle, so a thumbnail
       re-shown from the HTTP cache counts too — it decodes all the same. */
    await page.evaluate(() => {
      const counter = { loaded: 0 };
      (window as unknown as { __thumbsLoaded: typeof counter }).__thumbsLoaded = counter;
      new MutationObserver((records) => {
        for (const record of records) {
          if ((record.target as HTMLElement).dataset.thumb === "loaded") counter.loaded += 1;
        }
      }).observe(document.querySelector(".sheet-grid")!, {
        subtree: true,
        attributeFilter: ["data-thumb"],
      });
    });

    const scroll = await traceScroll(
      client,
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      distance,
      SLOW_SPEED_PX_S,
    );

    const scrolled = await grid.evaluate((el) => el.scrollTop);
    expect(scrolled).toBeGreaterThanOrEqual(distance - 1);

    const thumbnailsDuringScroll = await page.evaluate(
      () => (window as unknown as { __thumbsLoaded: { loaded: number } }).__thumbsLoaded.loaded,
    );

    /* Back to cards already seen. Their files are immutable, so they come from
       the browser's HTTP cache; this is the reading that says whether the
       navigator needs a cache of its own. */
    let scrollBackMs: number | null = null;
    if (THUMBS) {
      await page.waitForTimeout(1000);
      const startedAt = await grid.evaluate((el) => {
        el.scrollTop = 0;
        return performance.now();
      });
      scrollBackMs = Math.round((await screenFilled(page)) - startedAt);
    }

    const sample = {
      screenfulMs,
      scrollBackMs,
      thumbnailsDuringScroll,
      jsHeapMb: Math.round(jsHeapMb * 10) / 10,
      ...scroll,
    };
    samples.push(sample);

    console.log(
      `    run ${run + 1}/${RUNS}  ` +
        `screenful ${sample.screenfulMs} ms  ` +
        `back ${sample.scrollBackMs} ms  ` +
        `arrived while scrolling ${sample.thumbnailsDuringScroll}  ` +
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
    thumbnails: THUMBS,
    slowScroll: { speedPxPerS: SLOW_SPEED_PX_S, viewports: SLOW_VIEWPORTS },
    screenful: pick("screenfulMs"),
    scrollBack: pick("scrollBackMs"),
    memory: { jsHeapMb: pick("jsHeapMb") },
    slowScrollReading: {
      thumbnailsArrived: pick("thumbnailsDuringScroll"),
      frames: pick("frameCount"),
      frameMedian: pick("frameMedianMs"),
      frameP95: pick("frameP95Ms"),
      frameWorst: pick("frameWorstMs"),
      longFrames: pick("longFrames"),
      mainThread: pick("mainThreadMs"),
    },
    samples,
  };

  const file = `navigator-thumbnails-${THUMBS ? "on" : "off"}.json`;
  await mkdir("perf-results", { recursive: true });
  await writeFile(`perf-results/${file}`, `${JSON.stringify(result, null, 2)}\n`);

  const r = result.slowScrollReading;
  console.log(
    `\n  navigator thumbnails ${THUMBS ? "on" : "off"} — ${PROFILE.label}, median of ${RUNS}`,
  );
  if (THUMBS) {
    console.log(`    first screenful         ${format(result.screenful)}`);
    console.log(`    scroll back, filled     ${format(result.scrollBack)}`);
  }
  console.log(`    JS heap                 ${format(result.memory.jsHeapMb, "MB")}`);
  console.log(`  slow scroll, ${SLOW_VIEWPORTS} screens at ${SLOW_SPEED_PX_S} px/s`);
  console.log(`    thumbnails arrived      ${format(r.thumbnailsArrived, "")}`);
  console.log(`    frames drawn            ${format(r.frames, "")}`);
  console.log(`    frame median            ${format(r.frameMedian)}`);
  console.log(`    frame p95               ${format(r.frameP95)}`);
  console.log(`    frame worst             ${format(r.frameWorst)}`);
  console.log(`    frames > ${LONG_FRAME_MS} ms           ${format(r.longFrames, "")}`);
  console.log(`    main-thread rendering   ${format(r.mainThread)}`);
  console.log(`\n  written to perf-results/${file}\n`);

  expect(samples.every((s) => s.frameCount > 0)).toBe(true);
  /* With thumbnails on, a slow scroll in which none arrived measured nothing
     this spec exists to measure. */
  if (THUMBS) expect(samples.every((s) => s.thumbnailsDuringScroll > 0)).toBe(true);
});

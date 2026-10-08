import { mkdir, writeFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { format, summarize } from "./stats";
import {
  applyProfile,
  assertServerThrottled,
  collectLongTasks,
  PROFILE,
  readLongTasksSince,
} from "./throttle";

/* Deep zoom: past the pyramid's deepest level, the visible region is drawn
   from the sheet's own PDF by pdf.js, in a worker.

   Two facts are asserted, because they are the feature's whole claim:
   - pdf.js stays off the cold path. Opening a sheet and panning within the
     pyramid starts no worker and fetches no PDF.
   - Zooming past level 3 does produce a sharp render (`data-deep="1"`).

   Two spans are recorded, each from the view needing a deep render
   (`data-needs-deep` turning "1") to one being on screen (`data-deep`
   turning "1"), stamped in the page by a MutationObserver so the polling
   interval here is not part of the number:
   - cold: the first time in a session. Mostly the pdf.js chunks crossing the
     throttled link; the sheet's PDF is ~28 KB.
   - warm: after fitting the sheet and zooming in again. The worker and the
     parsed document are kept, so this is the render itself.
   Long tasks are counted inside each span, so a render that leaked onto the
   page's thread shows here.

   No gate yet: a gate is a known-good reading plus headroom, and these are
   the first readings. Results go to perf-results/deep-zoom.json. */

const RUNS = Number(process.env.PERF_RUNS ?? 3);
const SHEET_ID = process.env.PERF_SHEET ?? "A-101";
const SURFACE = '[data-renderer="tiled"]';

/* Stamps both attribute changes on the page's clock. Re-armed before each
   span, so the warm span does not read the cold one's stamps. */
async function armDeepWatch(page: Page) {
  await page.evaluate((selector) => {
    const element = document.querySelector(selector)!;
    const stamps: { needsAt: number | null; deepAt: number | null } = { needsAt: null, deepAt: null };
    (window as unknown as Record<string, unknown>).__deepStamps = stamps;
    const check = () => {
      if (stamps.needsAt === null && element.getAttribute("data-needs-deep") === "1") stamps.needsAt = performance.now();
      if (stamps.needsAt !== null && stamps.deepAt === null && element.getAttribute("data-deep") === "1") stamps.deepAt = performance.now();
    };
    new MutationObserver(check).observe(element, { attributes: true, attributeFilter: ["data-needs-deep", "data-deep"] });
  }, SURFACE);
}

/* Wheel-zooms at the centre until the view is past the pyramid. */
async function zoomPastPyramid(page: Page) {
  const box = (await page.locator(SURFACE).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let step = 0; step < 40; step += 1) {
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(150);
    if ((await page.locator(SURFACE).getAttribute("data-needs-deep")) === "1") return;
  }
  throw new Error("40 wheel steps never zoomed past the pyramid");
}

async function readSpan(page: Page) {
  await page.waitForFunction(
    () => (window as unknown as { __deepStamps: { deepAt: number | null } }).__deepStamps.deepAt !== null,
    undefined,
    { timeout: 120_000 },
  );
  const { needsAt, deepAt } = await page.evaluate(
    () => (window as unknown as { __deepStamps: { needsAt: number; deepAt: number } }).__deepStamps,
  );
  const tasks = await readLongTasksSince(page, needsAt, deepAt);
  return { ms: Math.round(deepAt - needsAt), longestTaskMs: tasks.longestMs };
}

test("viewer — deep zoom past the pyramid", async ({ browser, request }) => {
  test.setTimeout(900_000);
  const throttle = await assertServerThrottled((url) => request.get(url));

  const samples: {
    run: number;
    coldMs: number;
    coldLongestTaskMs: number;
    warmMs: number;
    warmLongestTaskMs: number;
    pdfjsBeforeZoom: string[];
  }[] = [];

  for (let run = 0; run < RUNS; run += 1) {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const page = await context.newPage();
    await collectLongTasks(page);
    await applyProfile(page);

    /* Anything pdf.js-shaped: a worker starting, or a sheet PDF. Chunk names
       are content hashes, so the worker is the stable signal for the library. */
    const pdfjsActivity: string[] = [];
    page.on("worker", (worker) => pdfjsActivity.push(`worker ${worker.url().slice(0, 30)}…`));
    page.on("request", (req) => {
      if (/\/sheets\/[^/]+\.pdf$/.test(req.url())) pdfjsActivity.push(req.url());
    });

    await page.goto(`/?sheet=${SHEET_ID}`, { waitUntil: "commit" });
    await page.waitForSelector(`[data-sheet="${SHEET_ID}"][data-state="painted"]`, { timeout: 420_000 });
    // Within the pyramid: a drag, which pans without changing the scale.
    const box = (await page.locator(SURFACE).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 200, box.y + box.height / 2 - 120, { steps: 20 });
    await page.mouse.up();
    await page.waitForTimeout(1000);
    const pdfjsBeforeZoom = [...pdfjsActivity];

    await armDeepWatch(page);
    await zoomPastPyramid(page);
    const cold = await readSpan(page);

    await page.getByRole("button", { name: "Fit sheet", exact: true }).click();
    await page.waitForSelector(`${SURFACE}[data-deep="0"]`);
    await armDeepWatch(page);
    await zoomPastPyramid(page);
    const warm = await readSpan(page);

    samples.push({
      run: run + 1,
      coldMs: cold.ms,
      coldLongestTaskMs: cold.longestTaskMs,
      warmMs: warm.ms,
      warmLongestTaskMs: warm.longestTaskMs,
      pdfjsBeforeZoom,
    });
    console.log(
      `    run ${run + 1}/${RUNS}  cold ${cold.ms} ms (longest task ${cold.longestTaskMs})  ` +
        `warm ${warm.ms} ms (longest task ${warm.longestTaskMs})  ` +
        `pdf.js before zoom: ${pdfjsBeforeZoom.length ? pdfjsBeforeZoom.join(", ") : "none"}`,
    );
    await context.close();
  }

  const result = {
    profile: PROFILE.label,
    throttle,
    sheetId: SHEET_ID,
    runs: RUNS,
    cold: {
      sharp: summarize(samples.map((s) => s.coldMs)),
      longestTask: summarize(samples.map((s) => s.coldLongestTaskMs)),
    },
    warm: {
      sharp: summarize(samples.map((s) => s.warmMs)),
      longestTask: summarize(samples.map((s) => s.warmLongestTaskMs)),
    },
    samples,
  };
  await mkdir("perf-results", { recursive: true });
  await writeFile("perf-results/deep-zoom.json", `${JSON.stringify(result, null, 2)}\n`);

  console.log(`\n  deep zoom — ${PROFILE.label}, ${RUNS} runs, ${SHEET_ID}`);
  console.log(`    cold: to sharp            ${format(result.cold.sharp)}`);
  console.log(`    cold: longest task        ${format(result.cold.longestTask)}`);
  console.log(`    warm: to sharp            ${format(result.warm.sharp)}`);
  console.log(`    warm: longest task        ${format(result.warm.longestTask)}`);
  console.log(`\n  written to perf-results/deep-zoom.json\n`);

  expect(samples.flatMap((s) => s.pdfjsBeforeZoom), "pdf.js ran before anyone zoomed past the pyramid").toEqual([]);
});

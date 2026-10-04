import { mkdir, writeFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { format, summarize } from "./stats";
import { applyProfile, collectLongTasks, PROFILE, readLongTasksSince } from "./throttle";

/* What a discipline filter costs: each discipline in the set hidden and shown
   again, one toggle at a time, timed from the click to the regrouped grid on
   screen.

   The reading is the navigator's own `gridline:filter-applied` span, which
   starts at the click event's timestamp and ends once the frame showing the
   result has painted. The page's `gridline:grid-shown` span, from the same
   run, is beside it for scale: a filter that cost more than drawing the grid
   in the first place would be doing more than handing the grid fewer rows.

   PERF_GRID=full runs the same toggles on the full grid, where a filter
   re-renders every card left in the set. It is the control: a spec that reads
   the same on both cannot see what a filter costs.

   Thumbnails are off (`?thumbs=0`). A toggle shows new cards, and their images
   arriving afterwards is the thumbnail spec's reading, not this one's. */

const RUNS = Number(process.env.PERF_RUNS ?? 3);
const GRID = process.env.PERF_GRID === "full" ? "full" : "virtual";

test(`navigator filters (${GRID}) — toggle each discipline`, async ({ browser }) => {
  test.setTimeout(300_000);

  const samples: {
    gridShownMs: number | null;
    toggles: number[];
    longestTaskMs: number;
  }[] = [];

  for (let run = 0; run < RUNS; run += 1) {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
    });
    const page = await context.newPage();
    await collectLongTasks(page);
    await applyProfile(page);

    await page.goto(`/?view=sheets&thumbs=0${GRID === "full" ? "&grid=full" : ""}`, {
      waitUntil: "commit",
    });
    await page.waitForFunction(
      () => Number(document.querySelector("[data-sheet-count]")?.getAttribute("data-sheet-count")) > 0,
      undefined,
      { timeout: 60_000 },
    );
    await expect(page.locator(`.sheet-grid-${GRID}`)).toHaveCount(1);
    await page.waitForTimeout(500);

    const gridShownMs = await page.evaluate(
      () => performance.getEntriesByName("gridline:grid-shown", "measure")[0]?.duration ?? null,
    );

    const disciplines = await page
      .locator("[data-discipline]")
      .evaluateAll((buttons) => buttons.map((b) => (b as HTMLElement).dataset.discipline!));
    expect(disciplines.length).toBeGreaterThan(1);

    const since = await page.evaluate(() => performance.now());

    /* Each toggle waits for its own measure before the next click, so no two
       overlap and each reading is one toggle's. */
    const toggle = async (discipline: string) => {
      const before = await page.evaluate(
        () => performance.getEntriesByName("gridline:filter-applied", "measure").length,
      );
      await page.click(`[data-discipline="${discipline}"]`);
      await page.waitForFunction(
        (n) => performance.getEntriesByName("gridline:filter-applied", "measure").length > n,
        before,
      );
      await page.waitForTimeout(200);
    };

    for (const discipline of disciplines) {
      await toggle(discipline);
      /* A hidden discipline's cards are gone from the grid. */
      await expect(
        page.locator(".sheet-grid .sheet-card-number", { hasText: new RegExp(`^${discipline}-`) }),
      ).toHaveCount(0);
      await toggle(discipline);
    }

    const toggles = await page.evaluate(() =>
      performance
        .getEntriesByName("gridline:filter-applied", "measure")
        .map((m) => Math.round(m.duration)),
    );
    expect(toggles).toHaveLength(disciplines.length * 2);
    const longestTaskMs = (await readLongTasksSince(page, since)).longestMs;

    const sample = {
      gridShownMs: gridShownMs === null ? null : Math.round(gridShownMs),
      toggles,
      longestTaskMs,
    };
    samples.push(sample);

    console.log(
      `    run ${run + 1}/${RUNS}  ` +
        `grid shown ${sample.gridShownMs} ms  ` +
        `toggles ${toggles.join(" ")} ms  ` +
        `longest task ${longestTaskMs} ms`,
    );

    await context.close();
  }

  /* Every toggle from every run is one sample. Worst is the reading that
     matters for a gate; the median says what a toggle usually costs. */
  const all = samples.flatMap((s) => s.toggles);
  const sorted = [...all].sort((a, b) => a - b);

  const result = {
    takenAt: new Date().toISOString(),
    profile: PROFILE.label,
    runs: RUNS,
    grid: GRID,
    gridShown: summarize(samples.map((s) => s.gridShownMs)),
    filterApplied: {
      ...summarize(all),
      p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? null,
    },
    longestTask: summarize(samples.map((s) => s.longestTaskMs)),
    samples,
  };

  const file = `navigator-filters-${GRID}.json`;
  await mkdir("perf-results", { recursive: true });
  await writeFile(`perf-results/${file}`, `${JSON.stringify(result, null, 2)}\n`);

  console.log(`\n  navigator filters (${GRID}) — ${PROFILE.label}, ${RUNS} runs`);
  console.log(`    grid shown, for scale   ${format(result.gridShown)}`);
  console.log(`    filter applied          ${format(result.filterApplied)}, p95 ${result.filterApplied.p95} ms`);
  console.log(`    longest task, toggling  ${format(result.longestTask)}`);
  console.log(`\n  written to perf-results/${file}\n`);
});

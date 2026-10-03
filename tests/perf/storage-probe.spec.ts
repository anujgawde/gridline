import { mkdir, writeFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { applyProfile, PROFILE } from "./throttle";

/* Where a tile actually comes from, and therefore what a tile store in
   IndexedDB would be worth.

   Tiles are served `immutable`, so the browser already keeps them on disk. A
   store in IndexedDB would be a second disk cache beside one that exists, so
   the question is what the first one is already doing. Three conditions, so the
   gap is a number rather than an argument:

     memory    a revisit inside one session — the tiles are decoded and held
     disk      after a reload, which empties memory but keeps the HTTP cache
     network   after a reload with the HTTP cache disabled

   Not a gate. It asserts almost nothing and grades nothing — it exists because a
   scope decision rests on its numbers, and the rule here is that a number anyone
   acts on traces to something anyone can re-run.

   What it found, on this machine: disk 100 ms against network 1357 ms and
   memory 66 ms. The browser's own cache is doing essentially all of the work, so
   an IndexedDB store cannot be justified on speed. Note it could not even
   recover the 34 ms gap to memory, since IndexedDB would hold encoded blobs and
   pay the same decode. What a store would buy is control — the HTTP cache can be
   evicted silently at any time — and offline, which belongs to Phase 5. */

const SHEET = "A-110";
const TIMEOUT = 420_000;

async function openSheet(page: import("@playwright/test").Page, sheetId: string) {
  const startedAt = Date.now();
  const input = page.getByLabel("Go to sheet");
  await input.fill(sheetId);
  await input.press("Enter");
  await page.waitForSelector(`[data-sheet="${sheetId}"][data-state="painted"]`, {
    timeout: TIMEOUT,
  });
  return Date.now() - startedAt;
}

async function waitForFirstPaint(page: import("@playwright/test").Page) {
  await page.waitForSelector('[data-renderer][data-state="painted"]', {
    timeout: TIMEOUT,
  });
}

test("where the tiles come from after a reload", async ({ browser }) => {
  test.setTimeout(TIMEOUT * 3);

  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
  });
  const page = await context.newPage();
  const client = await applyProfile(page);

  await page.goto("/?renderer=tiled", { waitUntil: "commit" });
  await waitForFirstPaint(page);

  /* First visit: nothing anywhere. This is the cost the other two are measured
     against. */
  const cold = await openSheet(page, SHEET);

  // Somewhere else, so the sheet under test is no longer the one on screen.
  await openSheet(page, "A-140");
  const memory = await openSheet(page, SHEET);

  /* A reload drops every decoded tile. The HTTP cache survives it, so whatever
     the sheet costs now is what the browser was already giving us. */
  await page.reload({ waitUntil: "commit" });
  await waitForFirstPaint(page);
  const disk = await openSheet(page, SHEET);

  /* Same again with the HTTP cache switched off, which is the floor: every tile
     over the paced link. */
  await client.send("Network.setCacheDisabled", { cacheDisabled: true });
  await page.reload({ waitUntil: "commit" });
  await waitForFirstPaint(page);
  const network = await openSheet(page, SHEET);

  const result = {
    takenAt: new Date().toISOString(),
    profile: PROFILE.label,
    sheetId: SHEET,
    msToOpen: { cold, memory, disk, network },
    /* Stated in the file rather than left to be re-derived, because this is the
       comparison the scope decision rests on. */
    diskVsNetwork: Number((network / Math.max(disk, 1)).toFixed(1)),
    diskVsMemory: Number((disk / Math.max(memory, 1)).toFixed(1)),
  };

  await mkdir("perf-results", { recursive: true });
  await writeFile(
    "perf-results/viewer-storage-probe.json",
    `${JSON.stringify(result, null, 2)}\n`,
  );

  console.log(`\n  where tiles come from — ${PROFILE.label}, sheet ${SHEET}`);
  console.log(`    cold, first ever visit      ${cold} ms`);
  console.log(`    memory, revisit in session  ${memory} ms`);
  console.log(`    disk, after reload          ${disk} ms`);
  console.log(`    network, cache disabled     ${network} ms`);
  console.log(
    `\n    disk is ${(network / Math.max(disk, 1)).toFixed(1)}x faster than network,` +
      ` and ${(disk / Math.max(memory, 1)).toFixed(1)}x slower than memory\n`,
  );

  console.log("\n  written to perf-results/viewer-storage-probe.json\n");

  /* The one assertion worth making: that the control applied. If disabling the
     HTTP cache did not slow anything down, the cache was never being bypassed
     and every other row here is meaningless. */
  expect(
    network,
    "disabling the HTTP cache changed nothing — the probe measured nothing",
  ).toBeGreaterThan(disk * 2);

  await context.close();
});

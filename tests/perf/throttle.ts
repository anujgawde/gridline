import type { CDPSession, Page } from "@playwright/test";

/* The mid-tier tablet profile every number in this project is tagged with.
   An untagged number is meaningless: the same code is fast on a laptop and slow
   in a gloved hand on site, and only one of those is the claim being made. */
export const PROFILE = {
  label: "4x CPU / Fast 3G",
  cpuThrottlingRate: 4,
  // Chrome DevTools' own Fast 3G preset, in the units CDP expects.
  network: {
    offline: false,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
    latency: 562.5,
  },
};

export interface LongTaskSummary {
  count: number;
  totalMs: number;
  longestMs: number;
}

/* Long tasks are how "the main thread was blocked" becomes a number. It is the
   measurement that decides whether parsing is genuinely off-thread later, so it
   is collected the same way before and after — a file named *.worker.ts proves
   nothing by itself. */
export async function collectLongTasks(page: Page) {
  await page.addInitScript(() => {
    const store: { start: number; duration: number }[] = [];
    (window as unknown as Record<string, unknown>).__longTasks = store;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        store.push({ start: entry.startTime, duration: entry.duration });
      }
    }).observe({ entryTypes: ["longtask"] });
  });
}

export async function readLongTasks(page: Page): Promise<LongTaskSummary> {
  const tasks = await page.evaluate(
    () =>
      (window as unknown as Record<string, { duration: number }[]>)
        .__longTasks ?? [],
  );
  return {
    count: tasks.length,
    totalMs: Math.round(tasks.reduce((sum, t) => sum + t.duration, 0)),
    longestMs: Math.round(Math.max(0, ...tasks.map((t) => t.duration))),
  };
}

/* The CPU throttle only. The network is throttled by the server, not here.

   CDP applies network conditions per target, and a service worker is its own
   target — so conditions set on the page do not reach anything the worker
   fetches. MSW registers at scope "/", which is every request after it
   activates. The failure is silent: resources loaded before the worker takes
   control are throttled, everything after runs at full local speed, and the
   waterfall looks plausible either way.

   It was caught by a number that refused to move. Opening a 42 MB document
   measured 2400 ms unthrottled and 2427 ms at "Fast 3G", while fetching the
   same file directly under the same conditions took 209 seconds.

   Playwright does not expose child CDP sessions, so the worker target cannot be
   reached from here. The fix is to throttle the link instead of the client:
   `tools/serve.mjs --throttle` paces every response, so it applies to all three
   origins and to every requester, worker or not. Run the servers with it. */
export async function applyProfile(page: Page): Promise<CDPSession> {
  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setCPUThrottlingRate", {
    rate: PROFILE.cpuThrottlingRate,
  });
  await client.send("Network.enable");
  // Without this the metrics domain reports nothing and every heap reading is 0.
  await client.send("Performance.enable");
  return client;
}

/* Confirms the servers are actually pacing responses, so a run cannot silently
   produce unthrottled numbers that look like throttled ones. */
export async function assertServerThrottled(
  get: (url: string) => Promise<{ headers(): Record<string, string> }>,
) {
  const response = await get("http://localhost:4100/");
  const header = response.headers()["x-gridline-throttle"];
  if (!header) {
    throw new Error(
      "servers are not throttling. Run `pnpm serve` (which passes --throttle), " +
        "or these numbers describe a local disk rather than a network.",
    );
  }
  return header;
}

/* Heap read from the browser's own metrics rather than performance.memory,
   which is coarse and not available everywhere. */
export async function readHeapBytes(client: CDPSession) {
  const { metrics } = await client.send("Performance.getMetrics");
  return metrics.find((m) => m.name === "JSHeapUsedSize")?.value ?? 0;
}

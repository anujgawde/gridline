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

export async function applyProfile(page: Page): Promise<CDPSession> {
  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setCPUThrottlingRate", {
    rate: PROFILE.cpuThrottlingRate,
  });
  await client.send("Network.enable");
  await client.send("Network.emulateNetworkConditions", PROFILE.network);
  // Without this the metrics domain reports nothing and every heap reading is 0.
  await client.send("Performance.enable");
  return client;
}

/* Heap read from the browser's own metrics rather than performance.memory,
   which is coarse and not available everywhere. */
export async function readHeapBytes(client: CDPSession) {
  const { metrics } = await client.send("Performance.getMetrics");
  return metrics.find((m) => m.name === "JSHeapUsedSize")?.value ?? 0;
}

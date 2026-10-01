import type { Page } from "@playwright/test";

/* Input-to-paint, measured two ways, because neither instrument is sufficient
   alone.

   `eventTiming` is the Event Timing API — the same thing INP is built from, and
   what buildplan.md §7.1 names. It reports the span from the event's hardware
   timestamp to the next paint, which is exactly the budget. Its weakness is
   granularity: durations are rounded to 8 ms, so against a 32 ms budget it has
   four buckets. It also only sees trusted events, which is why the pinch is
   dispatched over CDP rather than built in page script.

   `settle` is finer and more conservative. It pairs each input with the moment
   the renderer's own reported scale changes in the DOM, so it spans event
   handling, the draw, and React reflecting it. That last part is not paint, so
   this over-states rather than under-states — the honest direction for a gate.

   Reporting both means a disagreement between them is visible rather than
   hidden inside one chosen number. */

export interface LatencySummary {
  eventTimingMs: number[];
  settleMs: number[];
}

export async function installLatencyInstrument(page: Page) {
  await page.addInitScript(() => {
    const store = {
      eventTiming: [] as number[],
      settle: [] as number[],
      lastInputAt: null as number | null,
      armed: false,
    };
    (window as unknown as Record<string, unknown>).__latency = store;

    (window as unknown as Record<string, unknown>).__armLatency = () => {
      store.eventTiming.length = 0;
      store.settle.length = 0;
      store.lastInputAt = null;
      store.armed = true;
    };

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!store.armed) continue;
        if (!entry.name.startsWith("pointer") && !entry.name.startsWith("touch")) {
          continue;
        }
        store.eventTiming.push(entry.duration);
      }
      /* durationThreshold is missing from this TypeScript lib's
         PerformanceObserverInit, but the browser honours it. Without it the
         default is 104 ms, which would discard every interaction that came in
         under the budget and report only the failures. */
    }).observe({
      type: "event",
      durationThreshold: 0,
      buffered: true,
    } as unknown as PerformanceObserverInit);

    /* The input side of the settle measurement. Capture phase, so it runs
       before the gesture controller's own listener and the timestamp is not
       preceded by the handling being measured. */
    const noteInput = (event: Event) => {
      if (store.armed) store.lastInputAt = event.timeStamp;
    };
    window.addEventListener("pointermove", noteInput, { capture: true });
    window.addEventListener("pointerdown", noteInput, { capture: true });

    /* The paint side. The renderer writes its current scale onto the element it
       draws into, so the attribute changing is the first moment the new view is
       observable from outside the renderer. */
    const watch = () => {
      const target = document.querySelector("[data-renderer]");
      if (!target) {
        requestAnimationFrame(watch);
        return;
      }
      new MutationObserver(() => {
        if (!store.armed || store.lastInputAt === null) return;
        store.settle.push(performance.now() - store.lastInputAt);
        store.lastInputAt = null;
      }).observe(target, {
        attributes: true,
        attributeFilter: ["data-scale"],
      });
    };
    requestAnimationFrame(watch);
  });
}

/* Armed immediately before a gesture rather than at page load, so loading the
   sheet — which is a different budget with a different instrument — contributes
   nothing to these numbers. */
export async function armLatency(page: Page) {
  await page.evaluate(() => {
    const arm = (window as unknown as Record<string, () => void>).__armLatency;
    if (arm) arm();
  });
}

interface LatencyStore {
  eventTiming: number[];
  settle: number[];
}

export async function readLatency(page: Page): Promise<LatencySummary> {
  return page.evaluate(() => {
    const store = (window as unknown as Record<string, LatencyStore | undefined>)
      .__latency;
    return {
      eventTimingMs: store ? [...store.eventTiming] : [],
      settleMs: store ? [...store.settle] : [],
    };
  });
}

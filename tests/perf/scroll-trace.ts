import type { CDPSession } from "@playwright/test";

/* Scrolling measured from a CDP trace: frames the compositor actually drew,
   and the main thread's rendering work while it did.

   The event read is DrawFrame. BeginFrame looks like the obvious choice and is
   useless: it is the vsync tick, emitted whether or not a frame followed, so it
   reads 16.7 ms through an 80 ms main-thread stall. requestAnimationFrame
   counting cannot see a frame the browser was too busy to call back for.

   Scrolling is compositor-driven, so a busy main thread rarely drops a frame;
   it shows up instead as main-thread rendering time. Both are returned, because
   they answer different questions — what the user sees, and what the page
   costs to keep it that way. */

/* One-and-a-half refresh intervals at 60 Hz. A frame longer than this is one
   the display had to repeat. */
export const LONG_FRAME_MS = 25;

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

export interface ScrollReading {
  frameCount: number;
  frameMedianMs: number;
  frameP95Ms: number;
  frameWorstMs: number;
  longFrames: number;
  mainThreadMs: number;
}

/* Scrolls `distance` pixels down from the point (x, y) at `speed` px/s and
   reads the trace taken across it.

   The scroll is Chrome's own gesture synthesiser, generating wheel input inside
   the browser at display rate. Wheel events sent one at a time from the test
   are paced by the protocol round trip instead, and the idle gaps between them
   read as slow frames even with no throttling at all. */
export async function traceScroll(
  client: CDPSession,
  origin: { x: number; y: number },
  distance: number,
  speed: number,
): Promise<ScrollReading> {
  /* Both listeners attach before tracing starts. Attached after Tracing.end, a
     short trace can complete first and the wait never resolves. */
  const chunks: TraceEvent[][] = [];
  const collect = (params: unknown) => {
    chunks.push((params as { value: TraceEvent[] }).value);
  };
  client.on("Tracing.dataCollected", collect);
  const complete = new Promise<void>((resolve) => {
    client.once("Tracing.tracingComplete", () => resolve());
  });

  await client.send("Tracing.start", {
    categories: "disabled-by-default-devtools.timeline.frame,devtools.timeline",
  });
  await client.send("Input.synthesizeScrollGesture", {
    x: Math.round(origin.x),
    y: Math.round(origin.y),
    yDistance: -distance,
    speed,
    gestureSourceType: "mouse",
  });
  await client.send("Tracing.end");
  await complete;
  client.off("Tracing.dataCollected", collect);

  const events = chunks.flat();

  const drawn = events
    .filter((e) => e.name === "DrawFrame" && typeof e.ts === "number")
    .map((e) => e.ts as number)
    .sort((a, b) => a - b);

  /* Trace timestamps are in microseconds. No interval is discarded: the
     gesture keeps the compositor busy throughout, so a long one is a frame the
     user saw repeated, not idle time. */
  const intervals: number[] = [];
  for (let i = 1; i < drawn.length; i += 1) {
    intervals.push((drawn[i]! - drawn[i - 1]!) / 1000);
  }
  const sorted = [...intervals].sort((a, b) => a - b);
  const quantile = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
  const tenth = (ms: number) => Math.round(ms * 10) / 10;

  const mainThreadMs =
    events
      .filter((e) => e.name && MAIN_THREAD_EVENTS.has(e.name) && typeof e.dur === "number")
      .reduce((sum, e) => sum + (e.dur as number), 0) / 1000;

  return {
    frameCount: intervals.length,
    frameMedianMs: tenth(quantile(0.5)),
    frameP95Ms: tenth(quantile(0.95)),
    frameWorstMs: tenth(sorted[sorted.length - 1] ?? 0),
    longFrames: intervals.filter((ms) => ms > LONG_FRAME_MS).length,
    mainThreadMs: Math.round(mainThreadMs),
  };
}

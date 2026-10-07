import type { Page } from "@playwright/test";

/* Frame intervals during interaction.
   
   Recorded as gaps between animation frames rather than by counting frames per
   second. Counting is what misleads under throttling: frames that never happen
   cannot be counted, so a frozen second looks like a second with few frames
   instead of a second with one enormous gap. The gap is the thing a user feels,
   so the gap is what gets recorded.

   Reported as the 95th percentile and the worst single interval. A budget of
   "no frame over 50 ms" is a statement about the worst one. */
export interface FrameSummary {
  p95Ms: number;
  worstMs: number;
  frames: number;
}

export async function startFrameRecording(page: Page) {
  await page.evaluate(() => {
    const gaps: number[] = [];
    let last = performance.now();
    let running = true;
    (window as unknown as Record<string, unknown>).__stopFrames = () => {
      running = false;
      return gaps;
    };
    const tick = () => {
      const now = performance.now();
      gaps.push(now - last);
      last = now;
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

export async function stopFrameRecording(page: Page): Promise<FrameSummary> {
  const gaps = await page.evaluate(() => {
    const stop = (window as unknown as Record<string, () => number[]>)
      .__stopFrames;
    return stop ? stop() : [];
  });

  // The first gap spans from before recording began, so it describes setup
  // rather than interaction.
  const measured = gaps.slice(1).sort((a, b) => a - b);
  if (measured.length === 0) return { p95Ms: 0, worstMs: 0, frames: 0 };

  return {
    p95Ms: Math.round(measured[Math.floor(measured.length * 0.95)]),
    worstMs: Math.round(measured[measured.length - 1]),
    frames: measured.length,
  };
}

/* A pan and a zoom, driven as real pointer and wheel input rather than by
   setting state, so what gets measured includes event handling and compositing
   — the parts a user actually waits on. */
export async function panAndZoom(page: Page) {
  const box = await page.locator("[data-renderer]").boundingBox();
  if (!box) return;

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 12; i += 1) {
    await page.mouse.move(cx - i * 28, cy - i * 14);
  }
  await page.mouse.up();

  for (let i = 0; i < 6; i += 1) {
    await page.mouse.wheel(0, -120);
  }
  for (let i = 0; i < 4; i += 1) {
    await page.mouse.wheel(0, 120);
  }
}

/* A long, continuous one-finger pan.

   Driven through Playwright's mouse, whose events are trusted, so this exercises
   the same path a finger does: real pointer events, the gesture controller, the
   draw loop, compositing. Longer than the session walk's pan because frame
   pacing is a question about sustained movement — a dozen steps measures mostly
   startup. `target` is the element panned: the viewer's by default. */
export async function sustainedPan(page: Page, steps = 60, target = "[data-renderer]") {
  const box = await page.locator(target).boundingBox();
  if (!box) return;

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  /* A circle rather than a straight line: a straight drag leaves the element
     after a few hundred pixels and the gesture ends early, which would measure
     a short pan and call it a long one. */
  const radius = Math.min(box.width, box.height) / 4;

  await page.mouse.move(cx + radius, cy);
  await page.mouse.down();
  for (let i = 1; i <= steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2;
    await page.mouse.move(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
  }
  await page.mouse.up();
}

/* A real two-finger pinch, dispatched over CDP.

   Synthetic PointerEvents built in page script are untrusted, and the Event
   Timing API drops untrusted events — so a pinch faked that way produces a
   working gesture and no latency data at all. CDP touch dispatch produces
   trusted events, which is the only way this measurement exists. The context
   must be created with hasTouch.

   Nothing is timed from here. A page.evaluate between each move would put a
   round trip inside the interval being measured, which is why the latency
   instrument lives entirely in the page. */
export type PinchMode =
  /* Separation swings in and out around a middle. The scale stays inside a band
     whose tiles are already cached, so what is left is the cost of the gesture
     itself: event handling, the transform, the draw. */
  | "oscillate"
  /* Separation grows the whole way, pushing the view into levels that have not
     been fetched. This is what a person does when they zoom in to read a
     detail, and it costs tile requests and decodes on top of the gesture. */
  | "expand";

export async function pinch(
  page: Page,
  client: { send: (method: string, params?: unknown) => Promise<unknown> },
  { steps = 60, mode = "oscillate" }: { steps?: number; mode?: PinchMode } = {},
) {
  const box = await page.locator("[data-renderer]").boundingBox();
  if (!box) return;

  const cx = Math.round(box.x + box.width / 2);
  const cy = Math.round(box.y + box.height / 2);

  const points = (spread: number) => [
    { x: cx - Math.round(spread), y: cy, id: 1 },
    { x: cx + Math.round(spread), y: cy, id: 2 },
  ];

  /* Oscillating exists because a monotonic spread runs out of both screen and
     scale within about twenty moves, and twenty samples is too few for a tail:
     at n=20 the 95th percentile *is* the last element, so p95 and the worst
     case are the same reading reported twice. Swinging in and out sets the
     sample count by how long the gesture runs rather than by how far the
     fingers can travel. */
  const PERIOD = 20;
  const spreadAt = (i: number) =>
    mode === "oscillate"
      ? 180 + 120 * Math.sin((i / PERIOD) * Math.PI * 2)
      : Math.min(60 + i * 8, 460);

  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: points(spreadAt(0)),
  });

  for (let i = 1; i <= steps; i += 1) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: points(spreadAt(i)),
    });
  }

  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

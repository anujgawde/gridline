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

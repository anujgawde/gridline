import { describe, expect, it } from "vitest";

import {
  clampScale,
  coastStep,
  distance,
  flickVelocity,
  isCoasting,
  midpoint,
  panBy,
  pinch,
  zoomAbout,
} from "../transform";
import type { GestureView, PointerPair, PointerSample } from "../types";

const LIMITS = { minScale: 0.02, maxScale: 4 };

const view: GestureView = { x: 100, y: 50, scale: 0.25 };

const at = (time: number, x: number, y: number): PointerSample => ({
  time,
  x,
  y,
});

const pairAt = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
): PointerPair => ({ a: at(0, ax, ay), b: at(0, bx, by) });

describe("clampScale", () => {
  it("passes a scale inside the limits through", () => {
    expect(clampScale(1, LIMITS)).toBe(1);
  });

  it("holds at each limit", () => {
    expect(clampScale(99, LIMITS)).toBe(4);
    expect(clampScale(0.0001, LIMITS)).toBe(0.02);
  });
});

describe("panBy", () => {
  it("translates without touching scale", () => {
    expect(panBy(view, 10, -20)).toEqual({ x: 110, y: 30, scale: 0.25 });
  });
});

describe("zoomAbout", () => {
  /* The property that makes a viewer feel right: whatever sheet point is under
     the cursor stays under it. Asserted by converting back to sheet-space
     either side of the zoom. */
  it("keeps the sheet point under the anchor fixed", () => {
    const anchor = { x: 640, y: 360 };
    const before = {
      x: (anchor.x - view.x) / view.scale,
      y: (anchor.y - view.y) / view.scale,
    };

    const next = zoomAbout(view, 2, anchor.x, anchor.y, LIMITS);

    const after = {
      x: (anchor.x - next.x) / next.scale,
      y: (anchor.y - next.y) / next.scale,
    };

    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });

  it("scales by the factor", () => {
    expect(zoomAbout(view, 2, 0, 0, LIMITS).scale).toBeCloseTo(0.5, 10);
  });

  /* The creep guard. At a limit the requested factor no longer describes what
     happened, so translating by it moves the sheet for a zoom that did not
     occur — every further pinch at full zoom would slide the drawing. */
  it("does not translate when the scale is already at the limit", () => {
    const atMax: GestureView = { x: 100, y: 50, scale: LIMITS.maxScale };
    expect(zoomAbout(atMax, 4, 640, 360, LIMITS)).toEqual(atMax);

    const atMin: GestureView = { x: 100, y: 50, scale: LIMITS.minScale };
    expect(zoomAbout(atMin, 0.1, 640, 360, LIMITS)).toEqual(atMin);
  });
});

describe("distance and midpoint", () => {
  it("measures the span between two pointers", () => {
    expect(distance(at(0, 0, 0), at(0, 3, 4))).toBe(5);
  });

  it("finds the centre of a pair", () => {
    expect(midpoint(pairAt(0, 0, 10, 20))).toEqual({ x: 5, y: 10 });
  });
});

describe("pinch", () => {
  it("doubles the scale when the fingers double their separation", () => {
    const from = pairAt(100, 100, 200, 100);
    const to = pairAt(50, 100, 250, 100);
    expect(pinch(view, from, to, LIMITS).scale).toBeCloseTo(0.5, 10);
  });

  it("pans without scaling when both fingers move together", () => {
    const from = pairAt(100, 100, 200, 100);
    const to = pairAt(130, 90, 230, 90);

    const next = pinch(view, from, to, LIMITS);

    expect(next.scale).toBeCloseTo(view.scale, 10);
    expect(next.x).toBeCloseTo(view.x + 30, 10);
    expect(next.y).toBeCloseTo(view.y - 10, 10);
  });

  /* A pinch that also drifts has to do both in one frame. Doing them in
     separate passes is what makes a two-finger gesture feel like it is
     fighting itself. */
  it("scales and pans in the same frame", () => {
    const from = pairAt(100, 100, 200, 100);
    const to = pairAt(100, 100, 300, 100);

    const next = pinch(view, from, to, LIMITS);

    expect(next.scale).toBeCloseTo(0.5, 10);
    /* Midpoint moved 150 -> 200, so 50px of pan on top of the zoom. */
    const zoomOnly = zoomAbout(view, 2, 150, 100, LIMITS);
    expect(next.x).toBeCloseTo(zoomOnly.x + 50, 10);
  });

  /* Two fingers reported at the same pixel gives a zero baseline. Dividing by
     it would put scale at Infinity and the sheet nowhere recoverable. */
  it("treats a zero-separation baseline as pure pan", () => {
    const from = pairAt(100, 100, 100, 100);
    const to = pairAt(110, 100, 110, 100);

    const next = pinch(view, from, to, LIMITS);

    expect(next.scale).toBe(view.scale);
    expect(next.x).toBe(view.x + 10);
  });
});

describe("flickVelocity", () => {
  it("is zero with nothing to measure", () => {
    expect(flickVelocity([])).toEqual({ vx: 0, vy: 0 });
  });

  it("is zero when every sample shares a timestamp", () => {
    expect(flickVelocity([at(5, 0, 0), at(5, 50, 0)])).toEqual({
      vx: 0,
      vy: 0,
    });
  });

  it("measures px per millisecond", () => {
    const samples = [at(0, 0, 0), at(50, 50, 25)];
    expect(flickVelocity(samples)).toEqual({ vx: 1, vy: 0.5 });
  });

  /* A drag that stopped before the finger lifted must not throw the sheet.
     Only the tail of the gesture counts, so the stationary samples win. */
  it("ignores samples older than the velocity window", () => {
    const samples = [
      at(0, 0, 0),
      at(10, 500, 0),
      at(900, 500, 0),
      at(950, 500, 0),
    ];
    expect(flickVelocity(samples).vx).toBe(0);
  });
});

describe("isCoasting", () => {
  it("is false for a release that was barely moving", () => {
    expect(isCoasting({ vx: 0.001, vy: 0 })).toBe(false);
  });

  it("is true for a flick", () => {
    expect(isCoasting({ vx: 1.5, vy: 0 })).toBe(true);
  });
});

describe("coastStep", () => {
  it("returns the view untouched for a non-advancing frame", () => {
    const velocity = { vx: 1, vy: 0 };
    expect(coastStep(view, velocity, 0)).toEqual({ view, velocity });
  });

  it("slows the velocity", () => {
    const next = coastStep(view, { vx: 1, vy: 0 }, 16);
    expect(next.velocity.vx).toBeLessThan(1);
    expect(next.velocity.vx).toBeGreaterThan(0);
  });

  /* The reason momentum is integrated rather than multiplied per frame. If
     deceleration depended on the frame rate, the same flick would travel
     further on a fast display than on a throttled one — and a measurement
     taken under throttling would be a property of the throttle. */
  it("travels the same distance however the time is divided", () => {
    const velocity = { vx: 2, vy: -1 };

    const oneStep = coastStep(view, velocity, 32);

    const halfA = coastStep(view, velocity, 16);
    const halfB = coastStep(halfA.view, halfA.velocity, 16);

    expect(halfB.view.x).toBeCloseTo(oneStep.view.x, 9);
    expect(halfB.view.y).toBeCloseTo(oneStep.view.y, 9);
    expect(halfB.velocity.vx).toBeCloseTo(oneStep.velocity.vx, 9);
  });

  it("comes to a stop rather than drifting forever", () => {
    let current = { view, velocity: { vx: 3, vy: 3 } };
    let frames = 0;
    while (isCoasting(current.velocity) && frames < 1000) {
      current = coastStep(current.view, current.velocity, 16);
      frames += 1;
    }
    expect(isCoasting(current.velocity)).toBe(false);
    expect(frames).toBeLessThan(200);
  });
});

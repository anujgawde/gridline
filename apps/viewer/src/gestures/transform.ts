import type {
  GestureView,
  PointerPair,
  PointerSample,
  ScaleLimits,
  Velocity,
} from "./types";

/* The gesture maths, as pure functions.

   Everything here takes a view and returns a new one. No element, no event, no
   clock — the controller supplies all three. That split is deliberate: the last
   round of tile bugs were all in pure functions, and pure functions are the
   part that can be tested without a browser. */

/* Exponential decay constant for momentum, in milliseconds. A flick keeps
   roughly 37% of its speed after this long. Tuned by feel against a 1,500-sheet
   set on a throttled profile, not derived. */
const COAST_TAU_MS = 160;

/* Below this the sheet is barely moving and the remaining frames are wasted
   work. 0.02 px/ms is 20 px per second. */
const COAST_STOP_SPEED = 0.02;

/* Velocity is taken from this much of the gesture's tail. Longer averages away
   a genuine flick; shorter picks up the jitter of a finger lifting. */
const VELOCITY_WINDOW_MS = 100;

/* How far one press of a zoom button moves. Geometric rather than additive, so
   a press feels the same at every magnification, and the two directions are
   reciprocals so in-then-out lands back where it started. Exported because both
   renderers' toolbars use it and a drift between them would be invisible. */
export const ZOOM_STEP = 1.25;

export function clampScale(scale: number, limits: ScaleLimits): number {
  return Math.min(limits.maxScale, Math.max(limits.minScale, scale));
}

export function panBy(view: GestureView, dx: number, dy: number): GestureView {
  return { x: view.x + dx, y: view.y + dy, scale: view.scale };
}

/* Zoom so the sheet point under (px, py) stays under (px, py).

   Zooming about the origin instead is the single most common way a drawing
   viewer feels wrong: the sheet slides out from under the finger that asked for
   the zoom. */
export function zoomAbout(
  view: GestureView,
  factor: number,
  px: number,
  py: number,
  limits: ScaleLimits,
): GestureView {
  const scale = clampScale(view.scale * factor, limits);
  /* Recomputed from the clamped scale rather than reusing `factor`. At a limit
     the requested factor no longer describes what happened, and using it there
     translates the sheet for a zoom that did not occur — the view creeps every
     time someone keeps pinching at full zoom. */
  const ratio = scale / view.scale;
  return {
    scale,
    x: px - (px - view.x) * ratio,
    y: py - (py - view.y) * ratio,
  };
}

export function distance(a: PointerSample, b: PointerSample): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function midpoint(pair: PointerPair): { x: number; y: number } {
  return { x: (pair.a.x + pair.b.x) / 2, y: (pair.a.y + pair.b.y) / 2 };
}

/* One frame of a two-finger gesture.

   Scale and translation are both derived from the same pair of samples, so a
   pinch that also drifts across the screen does both at once rather than
   fighting itself. Scale is applied about the *previous* midpoint, then the
   midpoint's own movement is applied as a pan. */
export function pinch(
  view: GestureView,
  from: PointerPair,
  to: PointerPair,
  limits: ScaleLimits,
): GestureView {
  const before = distance(from.a, from.b);
  const after = distance(to.a, to.b);

  const start = midpoint(from);
  const end = midpoint(to);

  /* Two fingers landing on the same pixel gives a zero baseline, and dividing
     by it would put the scale at Infinity and the sheet nowhere. Treat it as
     pure pan for that frame. */
  const zoomed =
    before > 0
      ? zoomAbout(view, after / before, start.x, start.y, limits)
      : view;

  return panBy(zoomed, end.x - start.x, end.y - start.y);
}

/* Screen-space velocity from the tail of a gesture.

   Samples older than the window are ignored, so a drag that paused before the
   finger lifted does not throw the sheet across the screen on release. */
export function flickVelocity(samples: readonly PointerSample[]): Velocity {
  const last = samples[samples.length - 1];
  if (!last) return { vx: 0, vy: 0 };

  let first = last;
  for (let i = samples.length - 1; i >= 0; i -= 1) {
    const sample = samples[i];
    if (!sample) continue;
    if (last.time - sample.time > VELOCITY_WINDOW_MS) break;
    first = sample;
  }

  const dt = last.time - first.time;
  if (dt <= 0) return { vx: 0, vy: 0 };

  return { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt };
}

export function isCoasting(velocity: Velocity): boolean {
  return Math.hypot(velocity.vx, velocity.vy) >= COAST_STOP_SPEED;
}

/* One frame of momentum, integrated rather than stepped.

   Multiplying velocity by a per-frame constant makes the deceleration depend on
   the frame rate, so the same flick travels further on a fast display than on a
   throttled one — which would make a measured number a property of the machine
   that took it. Both the new velocity and the distance covered are solved for
   the real elapsed time instead. */
export function coastStep(
  view: GestureView,
  velocity: Velocity,
  dtMs: number,
): { view: GestureView; velocity: Velocity } {
  if (dtMs <= 0) return { view, velocity };

  const decay = Math.exp(-dtMs / COAST_TAU_MS);
  /* Integral of v0 * e^(-t/tau) over the frame. */
  const travel = COAST_TAU_MS * (1 - decay);

  return {
    view: panBy(view, velocity.vx * travel, velocity.vy * travel),
    velocity: { vx: velocity.vx * decay, vy: velocity.vy * decay },
  };
}

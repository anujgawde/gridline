/* The view is the transform from sheet-space to screen-space: a sheet point p
   lands at p * scale + (x, y). Structurally identical to the renderers' own
   view types on purpose — the gesture layer imports nothing from a renderer,
   and TypeScript's structural typing makes them interchangeable without either
   side owning the other. */
export interface GestureView {
  x: number;
  y: number;
  scale: number;
}

export interface ScaleLimits {
  minScale: number;
  maxScale: number;
}

/* Where a gesture is, not what the pointer is doing. "coasting" is the only
   phase with no pointer down: momentum still moving the sheet after a flick. */
export type GesturePhase = "idle" | "panning" | "pinching" | "coasting";

export interface PointerSample {
  /* performance.now(), not Date.now(). A velocity computed from a wall clock
     that can step is a velocity that can come out negative. */
  time: number;
  x: number;
  y: number;
}

export interface Velocity {
  /* px per millisecond, in screen-space. */
  vx: number;
  vy: number;
}

export interface PointerPair {
  a: PointerSample;
  b: PointerSample;
}

export interface GestureOptions extends ScaleLimits {
  /* Called on every change, at most once per animation frame during a gesture.
     The caller decides what to do with it — write a ref and schedule a draw, or
     set React state for a CSS transform. */
  onChange: (view: GestureView) => void;
  /* Momentum after a flick. Off for a renderer that cannot redraw fast enough
     to make coasting look like anything but stutter. */
  momentum?: boolean;
}

export interface GestureHandle {
  readonly phase: GesturePhase;
  readonly view: GestureView;
  /* Multiplies the current scale, about the centre of the attached element
     unless a screen point is given. This is what the toolbar's zoom buttons
     call, so a button and a pinch end up in the same code path. */
  zoomBy(factor: number, about?: { x: number; y: number }): void;
  setView(view: GestureView): void;
  /* Stops momentum where it is. A sheet change calls this, so the new sheet
     does not inherit the previous one's drift. */
  stop(): void;
}

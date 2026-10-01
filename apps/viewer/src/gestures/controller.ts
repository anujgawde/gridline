import {
  coastStep,
  flickVelocity,
  isCoasting,
  pinch,
  zoomAbout,
} from "./transform";
import type {
  GestureHandle,
  GestureOptions,
  GesturePhase,
  GestureView,
  PointerPair,
  PointerSample,
  Velocity,
} from "./types";

/* The stateful half of the gesture layer: which pointers are down, which phase
   that puts the gesture in, and the frame loop that keeps a flick moving after
   the finger has gone. All the arithmetic lives in `transform.ts`.

   Framework-agnostic on purpose. It attaches to an element and calls back; the
   React hook is a thin wrapper, and the thing being measured is not entangled
   with React's scheduling. */

/* How many pointer samples to keep per pointer. Only the tail matters — enough
   to cover the velocity window at a high report rate, and no more. */
const SAMPLE_LIMIT = 8;

export class GestureController implements GestureHandle {
  private element: HTMLElement | null = null;
  private current: GestureView;
  private readonly options: GestureOptions;

  private state: GesturePhase = "idle";
  private readonly pointers = new Map<number, PointerSample[]>();
  private pinchFrom: PointerPair | null = null;

  private frame = 0;
  private coastVelocity: Velocity = { vx: 0, vy: 0 };
  private coastTime = 0;

  constructor(view: GestureView, options: GestureOptions) {
    this.current = view;
    this.options = options;
  }

  get phase(): GesturePhase {
    return this.state;
  }

  get view(): GestureView {
    return this.current;
  }

  attach(element: HTMLElement): void {
    this.detach();
    this.element = element;

    element.addEventListener("pointerdown", this.onPointerDown);
    element.addEventListener("pointermove", this.onPointerMove);
    element.addEventListener("pointerup", this.onPointerUp);
    element.addEventListener("pointercancel", this.onPointerUp);
    /* Non-passive, and attached by hand rather than through React.

       React registers wheel as passive, where preventDefault is ignored — so
       the page scrolls or the browser zooms as well as the sheet. Two ticks in,
       the canvas is no longer under the pointer and the rest of the gesture
       goes somewhere else entirely. It reads as the zoom hitting a limit. */
    element.addEventListener("wheel", this.onWheel, { passive: false });
  }

  detach(): void {
    const element = this.element;
    if (!element) return;

    element.removeEventListener("pointerdown", this.onPointerDown);
    element.removeEventListener("pointermove", this.onPointerMove);
    element.removeEventListener("pointerup", this.onPointerUp);
    element.removeEventListener("pointercancel", this.onPointerUp);
    element.removeEventListener("wheel", this.onWheel);

    this.stop();
    this.pointers.clear();
    this.pinchFrom = null;
    this.state = "idle";
    this.element = null;
  }

  setView(view: GestureView): void {
    this.stop();
    this.current = view;
    this.options.onChange(this.current);
  }

  stop(): void {
    if (this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
    this.coastVelocity = { vx: 0, vy: 0 };
    if (this.state === "coasting") this.state = "idle";
  }

  zoomBy(factor: number, about?: { x: number; y: number }): void {
    const point = about ?? this.centre();
    this.stop();
    this.current = zoomAbout(
      this.current,
      factor,
      point.x,
      point.y,
      this.options,
    );
    this.options.onChange(this.current);
  }

  private centre(): { x: number; y: number } {
    const element = this.element;
    if (!element) return { x: 0, y: 0 };
    return { x: element.clientWidth / 2, y: element.clientHeight / 2 };
  }

  /* Element-relative, because the view's translation is in that same space. A
     zoom computed from client coordinates is off by the element's offset, which
     looks like the sheet jumping on the first wheel tick. */
  private local(event: PointerEvent | WheelEvent): PointerSample {
    const rect = this.element?.getBoundingClientRect();
    return {
      time: performance.now(),
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    };
  }

  private track(id: number, sample: PointerSample): void {
    const samples = this.pointers.get(id) ?? [];
    samples.push(sample);
    if (samples.length > SAMPLE_LIMIT) samples.shift();
    this.pointers.set(id, samples);
  }

  private latest(id: number): PointerSample | undefined {
    const samples = this.pointers.get(id);
    return samples?.[samples.length - 1];
  }

  /* The two pointers a pinch is computed from, in a stable order. Iteration
     order of the Map is insertion order, so a third finger landing does not
     reassign which two are driving the gesture. */
  private pair(): PointerPair | null {
    const ids = [...this.pointers.keys()];
    const first = ids[0];
    const second = ids[1];
    if (first === undefined || second === undefined) return null;

    const a = this.latest(first);
    const b = this.latest(second);
    if (!a || !b) return null;
    return { a, b };
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    /* A new touch cancels momentum. Landing a finger on a sheet that is still
       drifting and having it keep drifting is the clearest way to feel like the
       app is not listening. */
    this.stop();

    /* Tracked before capture is attempted, and the attempt is allowed to fail.

       setPointerCapture throws if the pointer is no longer active — a touch
       that ended between the event being queued and this handler running, which
       is exactly what a slow frame makes likely. Capturing first meant that
       throw aborted the handler before the pointer was recorded, so the gesture
       never started at all and the sheet simply ignored the finger. Capture is
       an improvement to a gesture, not a precondition for one. */
    this.track(event.pointerId, this.local(event));

    try {
      this.element?.setPointerCapture?.(event.pointerId);
    } catch {
      /* Without capture a pointer leaving the element ends the gesture early.
         That is a worse gesture, not a broken one. */
    }

    if (this.pointers.size >= 2) {
      this.state = "pinching";
      this.pinchFrom = this.pair();
    } else {
      this.state = "panning";
    }
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.pointers.has(event.pointerId)) return;

    const previous = this.latest(event.pointerId);
    const sample = this.local(event);
    this.track(event.pointerId, sample);

    if (this.state === "pinching") {
      const from = this.pinchFrom;
      const to = this.pair();
      if (!from || !to) return;
      this.current = pinch(this.current, from, to, this.options);
      this.pinchFrom = to;
      this.options.onChange(this.current);
      return;
    }

    if (this.state === "panning" && previous) {
      this.current = {
        ...this.current,
        x: this.current.x + (sample.x - previous.x),
        y: this.current.y + (sample.y - previous.y),
      };
      this.options.onChange(this.current);
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const samples = this.pointers.get(event.pointerId);
    this.pointers.delete(event.pointerId);

    if (this.pointers.size >= 2) {
      this.state = "pinching";
      this.pinchFrom = this.pair();
      return;
    }

    /* One finger left after a pinch: carry on panning from where it is rather
       than releasing. Re-seeding the remaining pointer's history matters — the
       samples it collected during the pinch describe a pinch, and reusing them
       as a pan velocity flings the sheet on release. */
    if (this.pointers.size === 1) {
      const id = [...this.pointers.keys()][0];
      if (id !== undefined) {
        const last = this.latest(id);
        if (last) this.pointers.set(id, [last]);
      }
      this.state = "panning";
      this.pinchFrom = null;
      return;
    }

    this.pinchFrom = null;

    /* Momentum only from a pan. A pinch release has no single direction worth
       continuing, and coasting out of one feels like a slip. */
    const flick =
      this.state === "panning" && samples ? flickVelocity(samples) : null;

    this.state = "idle";

    if (flick && this.options.momentum !== false && isCoasting(flick)) {
      this.coastVelocity = flick;
      this.coastTime = performance.now();
      this.state = "coasting";
      this.frame = requestAnimationFrame(this.coast);
    }
  };

  private readonly coast = (): void => {
    this.frame = 0;
    if (this.state !== "coasting") return;

    const now = performance.now();
    const dt = now - this.coastTime;
    this.coastTime = now;

    const next = coastStep(this.current, this.coastVelocity, dt);
    this.current = next.view;
    this.coastVelocity = next.velocity;
    this.options.onChange(this.current);

    if (isCoasting(this.coastVelocity)) {
      this.frame = requestAnimationFrame(this.coast);
    } else {
      this.state = "idle";
    }
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.stop();

    const point = this.local(event);
    /* Exponential in the wheel delta, so a trackpad's many small ticks and a
       mouse's few large ones land in the same place for the same total scroll. */
    this.current = zoomAbout(
      this.current,
      Math.exp(-event.deltaY / 500),
      point.x,
      point.y,
      this.options,
    );
    this.options.onChange(this.current);
  };
}

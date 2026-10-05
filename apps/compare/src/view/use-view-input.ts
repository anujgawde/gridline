import { useEffect } from "react";
import type { RefObject } from "react";

import { panBy, zoomAt } from "./view";
import type { View } from "./types";

type SetView = (update: (view: View | null) => View | null) => void;

/* Wheel delta to zoom factor. Exponential, so a notch in and a notch out
   return to the same scale. */
const WHEEL_RATE = 0.0015;

/* Drag pans, wheel zooms about the cursor. Every pane calls this with the
   same setter, which is the whole of "locked": there is one view, not two
   kept in step. */
export function useViewInput(target: RefObject<HTMLElement | null>, setView: SetView) {
  useEffect(() => {
    const el = target.current;
    if (!el) return;

    let last: { x: number; y: number } | null = null;

    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      last = { x: e.clientX, y: e.clientY };
    };
    const move = (e: PointerEvent) => {
      if (!last) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      setView((v) => (v ? panBy(v, dx, dy) : v));
    };
    const up = () => {
      last = null;
    };
    /* Not passive: the page must not scroll while the sheet zooms. */
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const box = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * WHEEL_RATE);
      setView((v) =>
        v ? zoomAt(v, factor, e.clientX - box.left, e.clientY - box.top) : v,
      );
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [target, setView]);
}

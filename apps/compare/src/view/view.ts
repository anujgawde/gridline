import type { Rect, Size, View } from "./types";

/* Far enough out to see the whole sheet small, far enough in to pass the
   deepest tile level. */
const MIN_SCALE = 0.02;
const MAX_SCALE = 8;
/* A little room around the page at fit, so its edge reads as an edge. */
const FIT_MARGIN = 0.95;

const clamp = (n: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, n));

/* The whole page, centred in the pane. */
export function fit(page: Size, pane: Size): View {
  const scale = clamp(
    Math.min(pane.width / page.width, pane.height / page.height) * FIT_MARGIN,
  );
  return {
    x: (page.width - pane.width / scale) / 2,
    y: (page.height - pane.height / scale) / 2,
    scale,
  };
}

/* Zoom by `factor` about a point in the pane, keeping the sheet point under it
   still — which is what makes a wheel zoom feel anchored to the cursor. */
export function zoomAt(view: View, factor: number, px: number, py: number): View {
  const scale = clamp(view.scale * factor);
  const sx = view.x + px / view.scale;
  const sy = view.y + py / view.scale;
  return { x: sx - px / scale, y: sy - py / scale, scale };
}

/* Zoom about the middle of the pane — the zoom buttons, which have no cursor
   to anchor to. */
export function zoomAtCentre(view: View, factor: number, pane: Size): View {
  return zoomAt(view, factor, pane.width / 2, pane.height / 2);
}

/* 100% is one sheet point per CSS pixel. */
export function zoomPercent(view: View): string {
  return `${Math.round(view.scale * 100)}%`;
}

/* Move by a distance in CSS pixels; the sheet follows the pointer. */
export function panBy(view: View, dx: number, dy: number): View {
  return { ...view, x: view.x - dx / view.scale, y: view.y - dy / view.scale };
}

/* The part of the sheet a pane of this size shows. */
export function visibleRect(view: View, pane: Size): Rect {
  return {
    x: view.x,
    y: view.y,
    width: pane.width / view.scale,
    height: pane.height / view.scale,
  };
}

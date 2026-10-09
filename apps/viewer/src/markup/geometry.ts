import type { Markup, Point } from "./schema";
import type { Box } from "./types";

/* The sheet-space box a markup occupies, grown by half its stroke so a thick
   line's outer edge is inside it. Text has no stroke; its box is its extent. */
export function bounds(markup: Markup): Box {
  if (markup.kind === "ink") {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of markup.points) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    return grow(
      { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
      markup.strokeWidth / 2,
    );
  }
  const box = { x: markup.x, y: markup.y, w: markup.w, h: markup.h };
  return markup.kind === "text" ? box : grow(box, markup.strokeWidth / 2);
}

/* The exact test, run only on candidates the index has already narrowed to.
   `tolerance` is in sheet units and comes from the caller: the model knows
   nothing about screens, so turning a touch target into points is not its job. */
export function hits(markup: Markup, point: Point, tolerance: number): boolean {
  if (markup.kind === "ink") {
    const reach = tolerance + markup.strokeWidth / 2;
    const reachSq = reach * reach;
    const pts = markup.points;
    for (let i = 1; i < pts.length; i++) {
      if (segmentDistanceSq(point, pts[i - 1]!, pts[i]!) <= reachSq) return true;
    }
    return false;
  }
  /* Inside counts, not only the outline: a gloved hand selects a cloud by
     tapping its middle. */
  const reach = markup.kind === "text" ? tolerance : tolerance + markup.strokeWidth / 2;
  return contains(grow(markup, reach), point);
}

export function contains(box: Box, [x, y]: Point): boolean {
  return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
}

export function intersects(a: Box, b: Box): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

function grow(box: Box, by: number): Box {
  return { x: box.x - by, y: box.y - by, w: box.w + by * 2, h: box.h + by * 2 };
}

/* Squared, so the hot loop takes no square root. */
function segmentDistanceSq([px, py]: Point, [ax, ay]: Point, [bx, by]: Point): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  /* A zero-length segment is a point: a pen that paused records the same
     sample twice. */
  const t =
    lengthSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  const cx = ax + t * dx - px;
  const cy = ay + t * dy - py;
  return cx * cx + cy * cy;
}

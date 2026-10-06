import type { Size } from "../view";
import type { ChangeKind, ChangeRegion, DetectOptions } from "./types";

/* Starting values, to be confirmed against A-131 and M-622 at level 2. */
export const DETECT_DEFAULTS: DetectOptions = { threshold: 48, cellSize: 8, dilation: 2 };

/* A region is one kind only when at least this share of its changed pixels
   is that kind. */
const DOMINANT = 0.9;

/* Finds where two renderings of a sheet differ. `from` and `to` are
   luminance, one byte per pixel, row-major, both `image` in size; `page` is
   the sheet in sheet units, so the regions come back in sheet space. */
export function detect(
  from: Uint8Array,
  to: Uint8Array,
  image: Size,
  page: Size,
  options: DetectOptions = DETECT_DEFAULTS,
): ChangeRegion[] {
  const { threshold, cellSize, dilation } = options;
  const cols = Math.ceil(image.width / cellSize);
  const rows = Math.ceil(image.height / cellSize);

  // Count added and removed pixels per cell, so the diff is walked once.
  const added = new Uint32Array(cols * rows);
  const removed = new Uint32Array(cols * rows);
  for (let y = 0; y < image.height; y++) {
    const rowCell = Math.floor(y / cellSize) * cols;
    for (let x = 0; x < image.width; x++) {
      const i = y * image.width + x;
      const delta = (from[i] ?? 255) - (to[i] ?? 255);
      if (delta > threshold) added[rowCell + Math.floor(x / cellSize)]! += 1;
      else if (-delta > threshold) removed[rowCell + Math.floor(x / cellSize)]! += 1;
    }
  }

  const changed = new Uint8Array(cols * rows);
  for (let c = 0; c < changed.length; c++) changed[c] = added[c]! + removed[c]! > 0 ? 1 : 0;

  const labels = components(dilate(changed, cols, rows, dilation), cols, rows);

  // Boxes and counts come from the changed cells only, so dilation joins
  // regions without making their boxes bigger.
  const found = new Map<number, { x0: number; y0: number; x1: number; y1: number; added: number; removed: number }>();
  for (let c = 0; c < changed.length; c++) {
    if (!changed[c]) continue;
    const label = labels[c]!;
    const cx = c % cols;
    const cy = Math.floor(c / cols);
    const r = found.get(label);
    if (r) {
      r.x0 = Math.min(r.x0, cx);
      r.y0 = Math.min(r.y0, cy);
      r.x1 = Math.max(r.x1, cx);
      r.y1 = Math.max(r.y1, cy);
      r.added += added[c]!;
      r.removed += removed[c]!;
    } else {
      found.set(label, { x0: cx, y0: cy, x1: cx, y1: cy, added: added[c]!, removed: removed[c]! });
    }
  }

  const sx = page.width / image.width;
  const sy = page.height / image.height;
  const regions = [...found.values()].map((r) => {
    // One cell of padding, so the box sits around the change, not on it.
    const left = Math.max(0, (r.x0 - 1) * cellSize);
    const top = Math.max(0, (r.y0 - 1) * cellSize);
    const right = Math.min(image.width, (r.x1 + 2) * cellSize);
    const bottom = Math.min(image.height, (r.y1 + 2) * cellSize);
    return {
      kind: kindOf(r.added, r.removed),
      rect: { x: left * sx, y: top * sy, width: (right - left) * sx, height: (bottom - top) * sy },
    };
  });

  regions.sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  return regions.map((r, i) => ({ id: i + 1, ...r }));
}

function kindOf(added: number, removed: number): ChangeKind {
  const total = added + removed;
  if (added >= total * DOMINANT) return "added";
  if (removed >= total * DOMINANT) return "removed";
  return "modified";
}

/* Square dilation by `r` cells. */
function dilate(grid: Uint8Array, cols: number, rows: number, r: number) {
  if (r === 0) return grid;
  const out = new Uint8Array(grid.length);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!grid[y * cols + x]) continue;
      for (let dy = Math.max(0, y - r); dy <= Math.min(rows - 1, y + r); dy++) {
        out.fill(1, dy * cols + Math.max(0, x - r), dy * cols + Math.min(cols - 1, x + r) + 1);
      }
    }
  }
  return out;
}

/* 4-connected labelling: each set cell gets its component's number, from 1;
   unset cells stay 0. */
function components(grid: Uint8Array, cols: number, rows: number) {
  const labels = new Uint32Array(grid.length);
  const stack: number[] = [];
  let next = 0;
  for (let start = 0; start < grid.length; start++) {
    if (!grid[start] || labels[start]) continue;
    next += 1;
    labels[start] = next;
    stack.push(start);
    while (stack.length > 0) {
      const c = stack.pop()!;
      const x = c % cols;
      const y = Math.floor(c / cols);
      for (const n of [x > 0 ? c - 1 : -1, x < cols - 1 ? c + 1 : -1, y > 0 ? c - cols : -1, y < rows - 1 ? c + cols : -1]) {
        if (n >= 0 && grid[n] && !labels[n]) {
          labels[n] = next;
          stack.push(n);
        }
      }
    }
  }
  return labels;
}

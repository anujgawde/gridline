import { describe, expect, it } from "vitest";

import { detect } from "../detect";

// 160 × 80 pixels is a 20 × 10 grid of 8px cells. The page is twice the
// image, so sheet space is image pixels × 2.
const image = { width: 160, height: 80 };
const page = { width: 320, height: 160 };
const options = { threshold: 48, cellSize: 8, dilation: 2 };

function blank() {
  return new Uint8Array(image.width * image.height).fill(255);
}

/* Inks the 8px cell at column `cx`, row `cy`, at luminance `value`. */
function ink(img: Uint8Array, cx: number, cy: number, value = 0) {
  for (let y = cy * 8; y < cy * 8 + 8; y++) img.fill(value, y * image.width + cx * 8, y * image.width + cx * 8 + 8);
  return img;
}

/* The sheet-space box for cells x0..x1, y0..y1, with its one cell of padding. */
function box(x0: number, y0: number, x1: number, y1: number) {
  return { x: (x0 - 1) * 16, y: (y0 - 1) * 16, width: (x1 - x0 + 3) * 16, height: (y1 - y0 + 3) * 16 };
}

describe("detect", () => {
  it("finds nothing when the revisions match", () => {
    expect(detect(ink(blank(), 5, 2), ink(blank(), 5, 2), image, page, options)).toEqual([]);
  });

  it("ignores lossy drift at or under the threshold", () => {
    expect(detect(blank(), ink(blank(), 5, 2, 255 - 48), image, page, options)).toEqual([]);
  });

  it("reads ink only in TO as added", () => {
    expect(detect(blank(), ink(blank(), 5, 2), image, page, options)).toEqual([
      { id: 1, kind: "added", rect: box(5, 2, 5, 2) },
    ]);
  });

  it("reads ink only in FROM as removed", () => {
    expect(detect(ink(blank(), 5, 2), blank(), image, page, options)).toEqual([
      { id: 1, kind: "removed", rect: box(5, 2, 5, 2) },
    ]);
  });

  it("reads a region with both as modified", () => {
    expect(detect(ink(blank(), 5, 2), ink(blank(), 6, 2), image, page, options)).toEqual([
      { id: 1, kind: "modified", rect: box(5, 2, 6, 2) },
    ]);
  });

  it("joins nearby strokes of one edit into one region", () => {
    const to = ink(ink(blank(), 5, 2), 8, 2);
    expect(detect(blank(), to, image, page, options)).toEqual([{ id: 1, kind: "added", rect: box(5, 2, 8, 2) }]);
  });

  it("keeps distant edits apart, numbered top to bottom", () => {
    const to = ink(ink(blank(), 15, 1), 2, 7);
    const from = ink(blank(), 2, 7);
    expect(detect(from, ink(to, 9, 6), image, page, options)).toEqual([
      { id: 1, kind: "added", rect: box(15, 1, 15, 1) },
      { id: 2, kind: "added", rect: box(9, 6, 9, 6) },
    ]);
  });

  it("numbers edits on one row left to right", () => {
    const to = ink(ink(blank(), 15, 4), 2, 4);
    expect(detect(blank(), to, image, page, options).map((r) => r.rect.x)).toEqual([box(2, 4, 2, 4).x, box(15, 4, 15, 4).x]);
  });

  it("keeps padded boxes on the page", () => {
    const [region] = detect(blank(), ink(blank(), 0, 0), image, page, options);
    expect(region?.rect).toEqual({ x: 0, y: 0, width: 32, height: 32 });
  });
});

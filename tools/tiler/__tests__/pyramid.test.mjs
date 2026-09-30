import { describe, expect, it } from "vitest";

import { levelGrid, levelWidth, MAX_LEVEL, pyramid, TILE, tileCount } from "../pyramid.mjs";

// ARCH E1 landscape, the sheet setgen produces.
const ASPECT = 3024 / 2160;

describe("pyramid", () => {
  it("doubles resolution at each level", () => {
    for (let level = 1; level <= MAX_LEVEL; level += 1) {
      expect(levelWidth(level)).toBe(levelWidth(level - 1) * 2);
    }
  });

  it("fits the whole sheet in one tile at level 0", () => {
    const base = levelGrid(0, ASPECT);
    expect(base.cols).toBe(1);
    expect(base.rows).toBe(1);
  });

  it("keeps the sheet's proportions at every level", () => {
    for (const level of pyramid(ASPECT)) {
      expect(level.width / level.height).toBeCloseTo(ASPECT, 2);
    }
  });

  it("costs about a third more than its deepest level alone", () => {
    /* Each level has a quarter the pixels of the one above, so the whole
       pyramid is ~4/3 of the top. The coarse levels are nearly free, which is
       why the renderer can afford to pin them. */
    const levels = pyramid(ASPECT);
    const top = levels[levels.length - 1];
    const total = levels.reduce((sum, l) => sum + l.width * l.height, 0);
    expect(total / (top.width * top.height)).toBeCloseTo(4 / 3, 1);
  });

  it("counts the tiles the tiler will actually write", () => {
    // 1 + 4 + 12 + 48 for this aspect ratio.
    expect(tileCount(ASPECT)).toBe(65);
  });

  it("covers the full level with its tile grid", () => {
    for (const level of pyramid(ASPECT)) {
      expect(level.cols * TILE).toBeGreaterThanOrEqual(level.width);
      expect(level.rows * TILE).toBeGreaterThanOrEqual(level.height);
    }
  });
});

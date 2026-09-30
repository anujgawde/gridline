import { describe, expect, it } from "vitest";

import type { TileIndex } from "../types";
import { fitScale, levelFor, tileRect, visibleTiles } from "../viewport";

const TILE = 512;

/* An ARCH E1 sheet, the size setgen produces, with the pyramid the tiler builds
   for it. Using the real dimensions rather than round numbers means the tests
   exercise the fractional grids that actually occur. */
const index: TileIndex = {
  sheetId: "A-101",
  title: "FLOOR PLAN LEVEL 01",
  discipline: "A",
  pageWidth: 3024,
  pageHeight: 2160,
  levels: [
    { level: 0, width: 512, height: 366, cols: 1, rows: 1 },
    { level: 1, width: 1024, height: 731, cols: 2, rows: 2 },
    { level: 2, width: 2048, height: 1463, cols: 4, rows: 3 },
    { level: 3, width: 4096, height: 2926, cols: 8, rows: 6 },
  ],
};

describe("fitScale", () => {
  it("fits the whole sheet inside the viewport", () => {
    const scale = fitScale(index, 1600, 1000);
    expect(index.pageWidth * scale).toBeLessThanOrEqual(1600);
    expect(index.pageHeight * scale).toBeLessThanOrEqual(1000);
  });

  it("fits by whichever axis is tighter", () => {
    // A wide, short viewport is constrained by height.
    const scale = fitScale(index, 4000, 500);
    expect(index.pageHeight * scale).toBeLessThanOrEqual(500);
  });
});

describe("levelFor", () => {
  it("uses the coarsest level when the sheet is small on screen", () => {
    expect(levelFor(index, fitScale(index, 400, 300)).level).toBe(0);
  });

  it("moves to a deeper level as the sheet is displayed larger", () => {
    const levels = [0.05, 0.2, 0.5, 1.2, 4].map(
      (scale) => levelFor(index, scale).level,
    );
    // Monotonic: zooming in never selects a coarser level.
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i]!).toBeGreaterThanOrEqual(levels[i - 1]!);
    }
  });

  it("never decodes far more pixels than the screen can show", () => {
    /* The point of level selection. At any scale the chosen level must not be
       wildly larger than the displayed size — otherwise tiles are being fetched
       and decoded for pixels that cannot be seen. */
    for (const scale of [0.05, 0.1, 0.3, 0.6, 1, 2]) {
      const displayed = index.pageWidth * scale;
      const chosen = levelFor(index, scale);
      expect(chosen.width).toBeLessThanOrEqual(Math.max(512, displayed * 1.5));
    }
  });

  it("caps at the deepest level rather than inventing one", () => {
    expect(levelFor(index, 50).level).toBe(3);
  });
});

describe("visibleTiles", () => {
  it("covers the viewport and nothing beyond the grid", () => {
    const level = index.levels[2]!;
    const keys = visibleTiles(
      index,
      level,
      { x: 0, y: 0, scale: 0.6 },
      1600,
      1000,
      TILE,
    );
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key.col).toBeGreaterThanOrEqual(0);
      expect(key.row).toBeGreaterThanOrEqual(0);
      expect(key.col).toBeLessThan(level.cols);
      expect(key.row).toBeLessThan(level.rows);
    }
  });

  it("needs a tile count bounded by the screen at whatever zoom", () => {
    /* The whole argument for tiling, and it is a property of level selection
       and visibility together rather than of either alone: asked for a level
       deeper than it would choose, visibleTiles will happily return the entire
       sheet. What must hold is that the level actually chosen never does.

       The bound is the viewport divided by tile size, plus one tile of overlap
       on each axis. */
    const screen = { width: 1600, height: 1000 };
    const bound =
      (Math.ceil(screen.width / TILE) + 1) * (Math.ceil(screen.height / TILE) + 1);

    for (const scale of [0.05, 0.1, 0.2, 0.4, 0.8, 1.5, 3]) {
      const level = levelFor(index, scale);
      const count = visibleTiles(
        index,
        level,
        { x: 0, y: 0, scale },
        screen.width,
        screen.height,
        TILE,
      ).length;
      expect(count, `scale ${scale}, level ${level.level}`).toBeLessThanOrEqual(
        bound,
      );
    }
  });

  it("returns a single tile when the whole sheet is small on screen", () => {
    const keys = visibleTiles(
      index,
      index.levels[0]!,
      { x: 0, y: 0, scale: fitScale(index, 1600, 1000) },
      1600,
      1000,
      TILE,
    );
    expect(keys).toHaveLength(1);
  });

  it("returns nothing when the sheet is panned entirely off screen", () => {
    const keys = visibleTiles(
      index,
      index.levels[3]!,
      { x: -100_000, y: -100_000, scale: 1 },
      1600,
      1000,
      TILE,
    );
    expect(keys).toHaveLength(0);
  });
});

describe("tileRect", () => {
  it("places neighbouring tiles adjacently", () => {
    const level = index.levels[2]!;
    const view = { x: 40, y: 20, scale: 0.6 };
    const a = tileRect(index, level, { level: 2, col: 0, row: 0 }, view, TILE);
    const b = tileRect(index, level, { level: 2, col: 1, row: 0 }, view, TILE);
    // b starts where a's untruncated width ends; the overlap is under a pixel.
    expect(b.x - a.x).toBeCloseTo(a.width - 1, 0);
    expect(b.y).toBe(a.y);
  });

  it("overlaps by a fraction of a pixel so no seam appears", () => {
    /* Rounding each tile down leaves hairline gaps between them at fractional
       scales, which reads as a grid drawn over the drawing. */
    const level = index.levels[3]!;
    const view = { x: 0.5, y: 0.5, scale: 0.37 };
    const rect = tileRect(index, level, { level: 3, col: 2, row: 1 }, view, TILE);
    const exact = TILE * ((view.scale * index.pageWidth) / level.width);
    expect(rect.width).toBeGreaterThan(exact);
  });

  it("is consistent with where visibleTiles says tiles are", () => {
    const level = index.levels[1]!;
    const view = { x: 0, y: 0, scale: 0.3 };
    for (const key of visibleTiles(index, level, view, 1600, 1000, TILE)) {
      const rect = tileRect(index, level, key, view, TILE);
      // A visible tile must intersect the viewport.
      expect(rect.x).toBeLessThan(1600);
      expect(rect.y).toBeLessThan(1000);
      expect(rect.x + rect.width).toBeGreaterThan(0);
      expect(rect.y + rect.height).toBeGreaterThan(0);
    }
  });
});

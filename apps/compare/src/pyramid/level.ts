import type { TileLevel } from "./schema";

/* Coarsest first. The schema guarantees at least one level; this is where
   that guarantee is turned into a type. */
function sortedLevels(levels: TileLevel[]) {
  const sorted = [...levels].sort((a, b) => a.level - b.level);
  const coarsest = sorted[0];
  const deepest = sorted[sorted.length - 1];
  if (!coarsest || !deepest) throw new Error("a tile index has no levels");
  return { sorted, coarsest, deepest };
}

/* The whole sheet in the fewest tiles — what a pane draws underneath. */
export function coarsestLevel(levels: TileLevel[]): TileLevel {
  return sortedLevels(levels).coarsest;
}

/* The coarsest level with at least one image pixel per device pixel at this
   scale, so nothing is upscaled while one exists. Past the deepest level the
   deepest is used, and the drawing softens — the pyramid's honest limit.

   `deviceScale` is device pixels per sheet unit. */
export function pickLevel(
  levels: TileLevel[],
  pageWidth: number,
  deviceScale: number,
): TileLevel {
  const { sorted, deepest } = sortedLevels(levels);
  const needed = pageWidth * deviceScale;
  return sorted.find((l) => l.width >= needed) ?? deepest;
}

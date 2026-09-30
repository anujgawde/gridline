// The shape of a tile pyramid, as arithmetic. No rendering, no files.
//
// Level 0 is the whole sheet in a single tile. Each level up doubles the
// resolution, so level n is TILE * 2^n pixels wide. A viewer picks the level
// closest to its current scale, which is what keeps the pixels it decodes
// bounded by the screen rather than by the sheet.

export const TILE = 512;

/* Level 3 is 4096px wide, which is where the naive renderer rasterized. Stopping
   here rather than pre-rendering deeper is deliberate: each further level costs
   4x the disk, and the viewer renders past this point on demand from the single
   sheet's PDF, which is ~28 KB. Storage is cheap but not free, and nobody zooms
   past this on most sheets. */
export const MAX_LEVEL = 3;

export function levelWidth(level) {
  return TILE * 2 ** level;
}

/* The grid at one level, given the sheet's aspect ratio. */
export function levelGrid(level, aspectRatio) {
  const width = levelWidth(level);
  const height = Math.round(width / aspectRatio);
  return {
    level,
    width,
    height,
    cols: Math.ceil(width / TILE),
    rows: Math.ceil(height / TILE),
  };
}

export function pyramid(aspectRatio, maxLevel = MAX_LEVEL) {
  return Array.from({ length: maxLevel + 1 }, (_, level) =>
    levelGrid(level, aspectRatio),
  );
}

export function tileCount(aspectRatio, maxLevel = MAX_LEVEL) {
  return pyramid(aspectRatio, maxLevel).reduce(
    (sum, l) => sum + l.cols * l.rows,
    0,
  );
}

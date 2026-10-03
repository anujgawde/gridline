import type { TileIndex, TileKey, TileLevel } from "./types";

/* Which tiles a viewport covers, and at which level.

   This is the arithmetic the whole approach rests on: the number of tiles is
   bounded by the size of the screen, not the size of the sheet. A 1600x1000
   viewport covers about a dozen tiles whatever the drawing measures, and that is
   why the bytes moved stop scaling with the document. */

export interface ViewState {
  /* Screen pixels the sheet's top-left corner is offset by. */
  x: number;
  y: number;
  /* Screen pixels per point of sheet space. */
  scale: number;
}

/* The level whose resolution is closest to what is actually being displayed.
   Picking a deeper level wastes bytes decoding pixels the screen cannot show;
   picking a shallower one shows a blurry sheet. */
export function levelFor(index: TileIndex, scale: number): TileLevel {
  const wanted = index.pageWidth * scale;
  const [first, ...rest] = index.levels;
  /* The index is validated on read and a pyramid with no levels is not a
     pyramid, so this is a contract violation rather than a state to handle. */
  if (!first) throw new Error(`${index.sheetId} has no tile levels`);

  let best = first;
  for (const level of rest) {
    if (level.width <= wanted * 1.5) best = level;
  }
  /* Past the deepest pre-rendered level the top one is stretched, which goes
     soft exactly as the naive renderer does past its own resolution. Rendering
     sharply beyond here means parsing the sheet's own PDF on demand, which is
     deliberately not in this step. */
  return best;
}

export function visibleTiles(
  index: TileIndex,
  level: TileLevel,
  view: ViewState,
  screenWidth: number,
  screenHeight: number,
  tileSize: number,
): TileKey[] {
  /* Tile coordinates are in the level's own pixel space, so a screen rectangle
     converts through the ratio between that level and sheet space. */
  const levelScale = (view.scale * index.pageWidth) / level.width;

  const left = (-view.x) / levelScale;
  const top = (-view.y) / levelScale;
  const right = left + screenWidth / levelScale;
  const bottom = top + screenHeight / levelScale;

  const firstCol = Math.max(0, Math.floor(left / tileSize));
  const lastCol = Math.min(level.cols - 1, Math.floor(right / tileSize));
  const firstRow = Math.max(0, Math.floor(top / tileSize));
  const lastRow = Math.min(level.rows - 1, Math.floor(bottom / tileSize));

  const keys: TileKey[] = [];
  for (let row = firstRow; row <= lastRow; row += 1) {
    for (let col = firstCol; col <= lastCol; col += 1) {
      keys.push({ level: level.level, col, row });
    }
  }
  return keys;
}

/* Every tile up to and including `throughLevel`, regardless of where the view
   is.

   Not viewport-dependent, because this answers a question about a sheet nobody
   is looking at yet: there is no view to clip against, and a sheet opens framed
   to fit, so the whole of each coarse level is what a first paint needs. For
   this set's geometry that is 5 tiles — level 0 is one, level 1 is 2x2. */
export function tilesThroughLevel(
  index: TileIndex,
  throughLevel: number,
): TileKey[] {
  const keys: TileKey[] = [];
  for (const level of index.levels) {
    if (level.level > throughLevel) continue;
    for (let row = 0; row < level.rows; row += 1) {
      for (let col = 0; col < level.cols; col += 1) {
        keys.push({ level: level.level, col, row });
      }
    }
  }
  return keys;
}

/* Where one tile lands on screen. */
export function tileRect(
  index: TileIndex,
  level: TileLevel,
  key: TileKey,
  view: ViewState,
  tileSize: number,
) {
  const levelScale = (view.scale * index.pageWidth) / level.width;
  const size = tileSize * levelScale;
  return {
    x: view.x + key.col * size,
    y: view.y + key.row * size,
    /* Rounded up so neighbouring tiles overlap by a fraction of a pixel rather
       than leaving a hairline gap between them at fractional scales. */
    width: Math.ceil(size) + 1,
    height: Math.ceil(size) + 1,
  };
}

/* The scale at which the whole sheet fits the viewport, with a margin. */
export function fitScale(
  index: TileIndex,
  screenWidth: number,
  screenHeight: number,
) {
  return (
    Math.min(
      screenWidth / index.pageWidth,
      screenHeight / index.pageHeight,
    ) * 0.92
  );
}

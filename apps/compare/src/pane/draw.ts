import { TILE_SIZE, coarsestLevel, pickLevel } from "../pyramid";
import type { TileIndex, TileLevel } from "../pyramid";
import { visibleRect } from "../view";
import type { Size, View } from "../view";

import type { TileSet } from "./tile-set";

/* Draws one level's tiles that fall inside the visible part of the sheet,
   asking for any it does not have yet. */
function drawLevel(
  ctx: CanvasRenderingContext2D,
  tiles: TileSet,
  index: TileIndex,
  level: TileLevel,
  view: View,
  pane: Size,
) {
  const size = TILE_SIZE * (index.pageWidth / level.width);
  const seen = visibleRect(view, pane);
  const c0 = Math.max(0, Math.floor(seen.x / size));
  const c1 = Math.min(level.cols - 1, Math.floor((seen.x + seen.width) / size));
  const r0 = Math.max(0, Math.floor(seen.y / size));
  const r1 = Math.min(level.rows - 1, Math.floor((seen.y + seen.height) / size));

  for (let row = r0; row <= r1; row += 1) {
    for (let col = c0; col <= c1; col += 1) {
      const bitmap = tiles.get(level.level, col, row);
      if (bitmap) ctx.drawImage(bitmap, col * size, row * size, size, size);
      else tiles.request(level.level, col, row);
    }
  }
}

/* One frame of a pane: level 0 underneath, so the pane is never blank, and
   the level matching the scale on top once its tiles arrive. Returns the
   levels in use, which are the ones the pane keeps. */
export function drawPane(
  ctx: CanvasRenderingContext2D,
  tiles: TileSet,
  index: TileIndex,
  view: View,
  pane: Size,
  dpr: number,
): number[] {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const s = view.scale * dpr;
  ctx.setTransform(s, 0, 0, s, -view.x * s, -view.y * s);

  /* Tiles at the page's edge carry white past it; the page ends where the
     sheet does. */
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, index.pageWidth, index.pageHeight);
  ctx.clip();

  const base = coarsestLevel(index.levels);
  const current = pickLevel(index.levels, index.pageWidth, s);
  drawLevel(ctx, tiles, index, base, view, pane);
  if (current.level !== base.level) {
    drawLevel(ctx, tiles, index, current, view, pane);
  }

  ctx.restore();
  return [base.level, current.level];
}

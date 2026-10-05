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

/* The sheet as a sheet of paper on the canvas: white, a hairline edge and a
   drop shadow, after the mockup's `0 0 0 1px #00000040, 0 14px 36px -12px
   #000000A6`. Canvas shadows have no spread, so the shadow is lighter to
   make up for the -12px it cannot shrink by. Shadow lengths are in device
   pixels and ignore the transform; the edge is one CSS pixel at any zoom. */
export function paper(ctx: CanvasRenderingContext2D, index: TileIndex, view: View, dpr: number) {
  ctx.save();
  ctx.shadowColor = "#00000073";
  ctx.shadowOffsetY = 14 * dpr;
  ctx.shadowBlur = 30 * dpr;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, index.pageWidth, index.pageHeight);
  ctx.restore();

  ctx.strokeStyle = "#00000040";
  ctx.lineWidth = 1 / view.scale;
  ctx.strokeRect(0, 0, index.pageWidth, index.pageHeight);
}

/* From sheet space to the canvas's device pixels. */
export function toSheet(ctx: CanvasRenderingContext2D, view: View, dpr: number) {
  const s = view.scale * dpr;
  ctx.setTransform(s, 0, 0, s, -view.x * s, -view.y * s);
}

/* The sheet's tiles: level 0 underneath, so the sheet is never blank, and the
   level matching the scale on top once its tiles arrive. Returns the levels
   in use, which are the ones the caller keeps. */
export function drawTiles(
  ctx: CanvasRenderingContext2D,
  tiles: TileSet,
  index: TileIndex,
  view: View,
  pane: Size,
  dpr: number,
): number[] {
  const s = view.scale * dpr;
  toSheet(ctx, view, dpr);

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

/* One frame of a pane: the paper, then the sheet on it. */
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
  toSheet(ctx, view, dpr);
  paper(ctx, index, view, dpr);
  return drawTiles(ctx, tiles, index, view, pane, dpr);
}

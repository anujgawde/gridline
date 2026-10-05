import type { TileIndex } from "../pyramid";
import type { Size, View } from "../view";

import { drawTiles, paper, toSheet } from "./draw";
import type { OnionLayer } from "./types";

function context(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  return ctx;
}

/* One revision on its own layer: white page, the tiles, then tinted. Lighten
   keeps the lighter of each channel, so black linework takes the tint and the
   white page stays white. Off the page stays transparent, so the paper's
   shadow on the main canvas shows through. */
function drawLayer(
  layer: OnionLayer,
  canvas: HTMLCanvasElement,
  view: View,
  pane: Size,
  dpr: number,
): number[] {
  const ctx = context(canvas);
  const { index } = layer;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  toSheet(ctx, view, dpr);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, index.pageWidth, index.pageHeight);
  const kept = drawTiles(ctx, layer.tiles, index, view, pane, dpr);

  toSheet(ctx, view, dpr);
  ctx.globalCompositeOperation = "lighten";
  ctx.fillStyle = layer.colour;
  ctx.fillRect(0, 0, index.pageWidth, index.pageHeight);
  ctx.globalCompositeOperation = "source-over";
  return kept;
}

function sizeTo(canvas: HTMLCanvasElement, width: number, height: number) {
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

/* Both revisions on one canvas. FROM is drawn as it is, TO multiplied over
   it: white times a colour is that colour, so a line in one revision only
   keeps its own tint, and teal times magenta is near-black navy, so lines in
   both read as unchanged. Returns each layer's levels in use. */
export function drawOnion(
  ctx: CanvasRenderingContext2D,
  from: OnionLayer,
  to: OnionLayer,
  scratch: { from: HTMLCanvasElement; to: HTMLCanvasElement },
  page: TileIndex,
  view: View,
  pane: Size,
  dpr: number,
) {
  const { width, height } = ctx.canvas;
  sizeTo(scratch.from, width, height);
  sizeTo(scratch.to, width, height);
  const kept = {
    from: drawLayer(from, scratch.from, view, pane, dpr),
    to: drawLayer(to, scratch.to, view, pane, dpr),
  };

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  toSheet(ctx, view, dpr);
  paper(ctx, page, view, dpr);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = from.opacity;
  ctx.drawImage(scratch.from, 0, 0);
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = to.opacity;
  ctx.drawImage(scratch.to, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  return kept;
}

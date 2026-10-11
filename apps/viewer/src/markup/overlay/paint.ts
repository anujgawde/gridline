import type { ViewFrame } from "../../renderers";
import type { Markup } from "../schema";
import type { Box } from "../types";
import type { PaintStyle } from "./types";

/* A revision cloud's scallop, in points. Sheet-space rather than screen-space,
   because a cloud is ink on the sheet: its scallops should not multiply as
   someone zooms in. */
const SCALLOP_PT = 12;

const LINE_HEIGHT = 1.2;

/* The sheet-space rectangle the canvas currently shows. */
export function visibleBox({ view, width, height }: ViewFrame): Box {
  return {
    x: -view.x / view.scale,
    y: -view.y / view.scale,
    w: width / view.scale,
    h: height / view.scale,
  };
}

/* Clears the overlay and draws the given markups, bottom first. The context
   is put into sheet-space once, so every shape is drawn in the units it is
   stored in and nothing here converts a coordinate by hand. */
export function paintMarkups(
  context: CanvasRenderingContext2D,
  frame: ViewFrame,
  markups: readonly Markup[],
  style: PaintStyle,
): void {
  const { view } = frame;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);

  context.strokeStyle = style.colour;
  context.fillStyle = style.colour;
  context.lineCap = "round";
  context.lineJoin = "round";
  const floor = style.minStrokePx / view.scale;

  for (const markup of markups) {
    if (markup.kind === "text") {
      paintText(context, markup, style.fontFamily);
      continue;
    }
    context.lineWidth = Math.max(markup.strokeWidth, floor);
    context.beginPath();
    if (markup.kind === "ink") {
      const [first, ...rest] = markup.points;
      context.moveTo(first![0], first![1]);
      for (const [x, y] of rest) context.lineTo(x, y);
    } else if (markup.kind === "rect") {
      context.rect(markup.x, markup.y, markup.w, markup.h);
    } else {
      traceCloud(context, markup);
    }
    context.stroke();
  }
}

function paintText(
  context: CanvasRenderingContext2D,
  markup: Extract<Markup, { kind: "text" }>,
  fontFamily: string,
): void {
  context.font = `${markup.size}px ${fontFamily}`;
  context.textBaseline = "top";
  markup.text.split("\n").forEach((line, i) => {
    context.fillText(line, markup.x, markup.y + i * markup.size * LINE_HEIGHT);
  });
}

/* Scallops along the inside of the box: each edge of a rectangle inset by
   one scallop is split into equal chords, and each chord bows outward by one
   scallop, so the peaks touch the box and never cross it. A quadratic curve
   peaks at half its control point's offset, hence the doubling. */
function traceCloud(
  context: CanvasRenderingContext2D,
  { x, y, w, h }: { x: number; y: number; w: number; h: number },
): void {
  const r = Math.min(SCALLOP_PT, w / 4, h / 4);
  const x0 = x + r;
  const y0 = y + r;
  const x1 = x + w - r;
  const y1 = y + h - r;
  const edges: [number, number, number, number, number, number][] = [
    /* from, to, outward normal */
    [x0, y0, x1, y0, 0, -1],
    [x1, y0, x1, y1, 1, 0],
    [x1, y1, x0, y1, 0, 1],
    [x0, y1, x0, y0, -1, 0],
  ];

  context.moveTo(x0, y0);
  for (const [ax, ay, bx, by, nx, ny] of edges) {
    const length = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.round(length / (2 * r)));
    for (let i = 0; i < n; i++) {
      const t0 = i / n;
      const t1 = (i + 1) / n;
      const mx = ax + (bx - ax) * ((t0 + t1) / 2);
      const my = ay + (by - ay) * ((t0 + t1) / 2);
      context.quadraticCurveTo(
        mx + nx * 2 * r,
        my + ny * 2 * r,
        ax + (bx - ax) * t1,
        ay + (by - ay) * t1,
      );
    }
  }
  context.closePath();
}

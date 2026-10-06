import type { Rect, Size } from "../view";

/* Ink only in TO is added, ink only in FROM is removed, and a region with
   enough of both is modified. The same reading the onion skin's colours
   give, made explicit. */
export type ChangeKind = "added" | "removed" | "modified";

/* One changed area of a sheet. `rect` is sheet space; ids run 1..n in
   reading order, top to bottom and then left to right. */
export interface ChangeRegion {
  id: number;
  kind: ChangeKind;
  rect: Rect;
}

/* `threshold` is the luminance step (0–255) a pixel has to move by to count
   as changed, because the tiles are lossy WebP and unchanged strokes near an
   edit drift by a few levels. `cellSize` is in image pixels; `dilation` is
   in cells, and joins the strokes of one edit into one region. */
export interface DetectOptions {
  threshold: number;
  cellSize: number;
  dilation: number;
}

export type ChangesState =
  | { status: "detecting" }
  | { status: "failed" }
  | { status: "ready"; regions: ChangeRegion[] };

/* One tile and where it sits in its level's image, in image pixels. */
export interface TilePlacement {
  url: string;
  x: number;
  y: number;
}

/* What the worker is sent: plain URLs and sizes, so it needs nothing but
   `detect` — no schema, no shared modules. */
export interface DetectRequest {
  image: Size;
  page: Size;
  from: TilePlacement[];
  to: TilePlacement[];
}

export type DetectResponse =
  | { regions: ChangeRegion[]; ms: number }
  | { error: string };

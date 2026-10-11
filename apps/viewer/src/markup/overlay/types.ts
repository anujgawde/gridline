import type { ViewSource } from "../../renderers";
import type { MarkupStores } from "./stores";

/* Resolved from tokens on the overlay's own element at paint time, so a theme
   switch anywhere above it is picked up on the next frame. */
export interface PaintStyle {
  colour: string;
  /* The thinnest a stroke may be drawn, in screen pixels. A stroke is stored
     in points, and a 2pt line at whole-sheet scale is under a pixel wide. */
  minStrokePx: number;
  fontFamily: string;
}

export interface MarkupLayerProps {
  /* Null until the renderer has handed one up. */
  source: ViewSource | null;
  stores: MarkupStores;
}

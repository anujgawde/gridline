/* What both panes draw from. `x`, `y` is the sheet-space point at a pane's
   top-left corner; `scale` is CSS pixels per sheet unit. Sheet-space is the
   page in points, top-down, as the tiles are cut. */
export interface View {
  x: number;
  y: number;
  scale: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Size {
  x: number;
  y: number;
}

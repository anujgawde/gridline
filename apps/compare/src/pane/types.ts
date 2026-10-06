import type { Dispatch, SetStateAction } from "react";

import type { ChangeRegion } from "../changes";
import type { Pyramid, TileIndex } from "../pyramid";
import type { Size, View } from "../view";

import type { TileSet } from "./tile-set";

export interface PaneProps {
  pyramid: Pyramid;
  /* "FROM" or "TO", over the pane's revision number. */
  heading: string;
  /* Null until the shared view has been fitted. */
  view: View | null;
  setView: Dispatch<SetStateAction<View | null>>;
  /* Reports the pane's size, so the shared view can be fitted to it. */
  onResize?: (size: Size) => void;
  /* Changes boxed over the drawing; the selected one is highlighted. */
  regions: ChangeRegion[];
  selectedId: number | null;
}

export interface OnionPaneProps {
  from: Pyramid;
  to: Pyramid;
  /* How strongly each revision is drawn, 0–1. */
  opacity: { from: number; to: number };
  view: View | null;
  setView: Dispatch<SetStateAction<View | null>>;
  onResize?: (size: Size) => void;
  regions: ChangeRegion[];
  selectedId: number | null;
}

/* One revision as the onion skin draws it. */
export interface OnionLayer {
  tiles: TileSet;
  index: TileIndex;
  colour: string;
  opacity: number;
}

/* The token colours change boxes are drawn in, read once per pane. */
export interface RegionStyle {
  paper: string;
  ink: string;
  stroke: string;
  accent: string;
  onAccent: string;
  font: string;
}

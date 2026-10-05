import type { Dispatch, SetStateAction } from "react";

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
}

export interface OnionPaneProps {
  from: Pyramid;
  to: Pyramid;
  /* How strongly each revision is drawn, 0–1. */
  opacity: { from: number; to: number };
  view: View | null;
  setView: Dispatch<SetStateAction<View | null>>;
  onResize?: (size: Size) => void;
}

/* One revision as the onion skin draws it. */
export interface OnionLayer {
  tiles: TileSet;
  index: TileIndex;
  colour: string;
  opacity: number;
}

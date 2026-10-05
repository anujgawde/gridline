import type { Dispatch, SetStateAction } from "react";

import type { Pyramid } from "../pyramid";
import type { Size, View } from "../view";

export interface PaneProps {
  pyramid: Pyramid;
  /* Shown over the pane, e.g. "FROM · REV 1". */
  label: string;
  /* Null until the shared view has been fitted. */
  view: View | null;
  setView: Dispatch<SetStateAction<View | null>>;
  /* Reports the pane's size, so the shared view can be fitted to it. */
  onResize?: (size: Size) => void;
}

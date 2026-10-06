import type { ChangesState } from "../changes";
import type { Pyramid } from "../pyramid";
import type { Size, View } from "../view";

/* The host says which sheet and which two revisions. Props rather than a
   `compare:request` subscription: the shell mounts this app only once a
   comparison is wanted, so the request has already been published by the time
   anything here could listen for it. */
export interface SheetCompareProps {
  sheetId: string;
  from: number;
  to: number;
}

export type Side = "from" | "to";

/* Two panes, or both revisions blended on one canvas. */
export type CompareMode = "side" | "onion";

/* Null until fitted. Locked, both hold the same view. */
export interface PaneViews {
  from: View | null;
  to: View | null;
}

export type PyramidsState =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; from: Pyramid; to: Pyramid };

export interface ChangesPanelProps {
  sheetId: string;
  from: number;
  to: number;
  /* The sheet in sheet units, to say where on it each change is. */
  page: Size | null;
  changes: ChangesState;
  selectedId: number | null;
  onSelect: (id: number) => void;
  /* -1 for the previous change, 1 for the next. */
  onStep: (direction: 1 | -1) => void;
}

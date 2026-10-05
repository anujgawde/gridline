import type { Pyramid } from "../pyramid";
import type { View } from "../view";

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

/* Null until fitted. Locked, both hold the same view. */
export interface PaneViews {
  from: View | null;
  to: View | null;
}

export type PyramidsState =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; from: Pyramid; to: Pyramid };

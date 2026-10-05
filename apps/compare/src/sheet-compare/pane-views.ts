import type { View } from "../view";

import type { PaneViews, Side } from "./types";

/* One pane moved. Locked, the move is the view both panes share; unlocked,
   only that pane's view changes. */
export function movePane(
  views: PaneViews,
  side: Side,
  next: View | null,
  locked: boolean,
): PaneViews {
  return locked ? { from: next, to: next } : { ...views, [side]: next };
}

/* Locking again: both panes take the view of the one moved last, so the pane
   being looked at stays put and the other comes to it. */
export function relock(views: PaneViews, lead: Side): PaneViews {
  return { from: views[lead], to: views[lead] };
}

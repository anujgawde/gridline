import { bus } from "@gridline/platform/bus";
import { Button } from "@gridline/platform/ui";

import type { CompareHeaderProps } from "./types";

/* This app's header, not the shell's, though it spans the top of the screen:
   the mode toggle and the revision pickers that join it later are Compare
   features, and adding one must never make the shell ship.

   Leaving is a bus event rather than a callback prop. The shell decides what
   is on screen; this app only says it is finished. */
export function CompareHeader({
  sheetId,
  from,
  to,
  locked,
  onLockedChange,
}: CompareHeaderProps) {
  return (
    <header className="compare-header">
      <span className="compare-label">Compare revisions</span>
      <span className="compare-sheet">{sheetId}</span>
      <span className="compare-range">
        REV {from} → REV {to}
      </span>
      <span className="compare-spacer" />
      <Button
        variant="ghost"
        aria-pressed={locked}
        onClick={() => onLockedChange(!locked)}
      >
        {locked ? "Panes locked" : "Panes unlocked"}
      </Button>
      <Button
        variant="secondary"
        icon="x"
        onClick={() => bus.publish("compare:closed", { sheetId })}
      >
        Exit compare
      </Button>
    </header>
  );
}

import { bus } from "@gridline/platform/bus";
import { Button } from "@gridline/platform/ui";

import "@gridline/platform/ui.css";

import type { SheetCompareProps } from "./types";
import "./sheet-compare.css";

/* The header is this app's, not the shell's, though it spans the top of the
   screen: the mode toggle and the revision pickers that join it later are
   Compare features, and adding one must never make the shell ship.

   Leaving is a bus event rather than a callback prop. The shell decides what
   is on screen; this app only says it is finished. */
export function SheetCompare({ sheetId, from, to }: SheetCompareProps) {
  return (
    <div className="compare">
      <header className="compare-header">
        <span className="compare-label">Compare revisions</span>
        <span className="compare-sheet">{sheetId}</span>
        <span className="compare-range">
          REV {from} → REV {to}
        </span>
        <span className="compare-spacer" />
        <Button
          variant="secondary"
          icon="x"
          onClick={() => bus.publish("compare:closed", { sheetId })}
        >
          Exit compare
        </Button>
      </header>
      <div className="compare-body" />
    </div>
  );
}

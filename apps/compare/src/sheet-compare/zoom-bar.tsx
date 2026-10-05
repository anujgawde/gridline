import { Button, IconButton, Toolbar, ToolbarSeparator } from "@gridline/platform/ui";

import { zoomPercent } from "../view";
import type { View } from "../view";

interface ZoomBarProps {
  /* The TO pane's view: the revision being worked towards. */
  view: View | null;
  locked: boolean;
  onZoom: (factor: number) => void;
  onFit: () => void;
  onLockedChange: (locked: boolean) => void;
}

/* One button step. Exponential like the wheel, so in then out is no change. */
const STEP = 1.25;

/* Zoom for both panes, and the lock again with its key, for a hand that is
   on the screen rather than the keyboard. */
export function ZoomBar({ view, locked, onZoom, onFit, onLockedChange }: ZoomBarProps) {
  return (
    <div className="compare-zoom-bar">
      <Toolbar tier="overlay" aria-label="Zoom">
        <IconButton icon="minus" label="Zoom out" onClick={() => onZoom(1 / STEP)} />
        <span className="compare-zoom-readout">{view ? zoomPercent(view) : ""}</span>
        <IconButton icon="plus" label="Zoom in" onClick={() => onZoom(STEP)} />
        <IconButton icon="maximize" label="Fit both sheets" onClick={onFit} />
        <ToolbarSeparator />
        <Button
          variant="ghost"
          size="sm"
          icon={locked ? "link" : "unlink"}
          aria-pressed={locked}
          onClick={() => onLockedChange(!locked)}
        >
          {locked ? "Locked" : "Unlocked"} <span className="compare-key-hint">L</span>
        </Button>
      </Toolbar>
    </div>
  );
}

import { useState } from "react";

import "@gridline/platform/ui.css";

import { Pane } from "../pane";

import { CompareHeader } from "./compare-header";
import type { SheetCompareProps } from "./types";
import { usePyramids } from "./use-pyramids";
import { usePaneViews } from "./use-pane-views";
import "./sheet-compare.css";

/* Two revisions side by side. Locked, panning or zooming either pane moves
   both; unlocked, each pane moves on its own. */
export function SheetCompare(props: SheetCompareProps) {
  const { sheetId, from, to } = props;
  const pyramids = usePyramids(sheetId, from, to);
  const [locked, setLocked] = useState(true);
  const { views, setters, setPaneSize } = usePaneViews(
    pyramids,
    `${sheetId}:${from}:${to}`,
    locked,
  );

  return (
    <div className="compare">
      <CompareHeader {...props} locked={locked} onLockedChange={setLocked} />
      <div className="compare-body">
        {pyramids.status === "ready" ? (
          <>
            <Pane
              pyramid={pyramids.from}
              label={`FROM · REV ${from}`}
              view={views.from}
              setView={setters.from}
              onResize={setPaneSize}
            />
            <Pane
              pyramid={pyramids.to}
              label={`TO · REV ${to}`}
              view={views.to}
              setView={setters.to}
            />
          </>
        ) : (
          <p className="compare-message">
            {pyramids.status === "loading"
              ? "Loading revisions…"
              : `${sheetId} REV ${from} → REV ${to} unavailable`}
          </p>
        )}
      </div>
    </div>
  );
}

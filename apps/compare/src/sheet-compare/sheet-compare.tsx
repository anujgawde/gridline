import { useCallback, useState } from "react";

import "@gridline/platform/ui.css";

import { Pane } from "../pane";

import { LockPill } from "./lock-pill";
import { RevisionBar } from "./revision-bar";
import type { SheetCompareProps } from "./types";
import { useLockKeys } from "./use-lock-keys";
import { usePaneViews } from "./use-pane-views";
import { usePyramids } from "./use-pyramids";
import { ZoomBar } from "./zoom-bar";
import "./sheet-compare.css";

/* Two revisions side by side. Locked, panning or zooming either pane moves
   both; unlocked, each pane moves on its own.

   The title and the way out are in the shell's top bar, not here: what is on
   screen is the shell's decision. Everything below that bar is Compare's. */
export function SheetCompare({ sheetId, from, to }: SheetCompareProps) {
  const pyramids = usePyramids(sheetId, from, to);
  const [lockedSetting, setLocked] = useState(true);
  const toggleLock = useCallback(() => setLocked((l) => !l), []);
  const shiftHeld = useLockKeys(toggleLock);
  const locked = lockedSetting && !shiftHeld;

  const { views, setters, setPaneSize, zoomBoth, fitBoth } = usePaneViews(
    pyramids,
    `${sheetId}:${from}:${to}`,
    locked,
  );

  return (
    <div className="compare">
      <RevisionBar sheetId={sheetId} from={from} to={to} />
      <div className="compare-body" data-locked={locked}>
        {pyramids.status === "ready" ? (
          <>
            <Pane
              pyramid={pyramids.from}
              heading="FROM"
              view={views.from}
              setView={setters.from}
              onResize={setPaneSize}
            />
            <Pane
              pyramid={pyramids.to}
              heading="TO"
              view={views.to}
              setView={setters.to}
            />
            <LockPill locked={locked} onLockedChange={setLocked} />
            <ZoomBar
              view={views.to}
              locked={locked}
              onZoom={zoomBoth}
              onFit={fitBoth}
              onLockedChange={setLocked}
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

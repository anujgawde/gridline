import { useState } from "react";

import "@gridline/platform/ui.css";

import { OnionPane, Pane } from "../pane";

import { blendOpacities } from "./blend";
import { BlendSlider } from "./blend-slider";
import { LockPill } from "./lock-pill";
import { ModeSwitch } from "./mode-switch";
import { OnionKey } from "./onion-key";
import { RevisionBar } from "./revision-bar";
import type { CompareMode, SheetCompareProps } from "./types";
import { useCompareKeys } from "./use-compare-keys";
import { usePaneViews } from "./use-pane-views";
import { usePyramids } from "./use-pyramids";
import { ZoomBar } from "./zoom-bar";
import "./sheet-compare.css";

/* Two revisions side by side, or blended as an onion skin. Side by side and
   locked, panning or zooming either pane moves both; unlocked, each pane
   moves on its own. The onion skin is one canvas, so it is always locked:
   both views follow it, and side by side picks up where it left off.

   The mode is not in the address. The shell owns the address, and a reload
   returning to side by side costs nothing.

   The title and the way out are in the shell's top bar, not here: what is on
   screen is the shell's decision. Everything below that bar is Compare's. */
export function SheetCompare({ sheetId, from, to }: SheetCompareProps) {
  const pyramids = usePyramids(sheetId, from, to);
  const [mode, setModeState] = useState<CompareMode>("side");
  const [blend, setBlend] = useState(50);
  const [lockedSetting, setLocked] = useState(true);

  const setMode = (next: CompareMode) => {
    if (next === "onion") setLocked(true);
    setModeState(next);
  };
  const shiftHeld = useCompareKeys({
    l: () => mode === "side" && setLocked((l) => !l),
    o: () => setMode("onion"),
    s: () => setMode("side"),
  });
  const onion = mode === "onion";
  const locked = onion || (lockedSetting && !shiftHeld);

  const { views, setters, setPaneSize, zoomBoth, fitBoth } = usePaneViews(
    pyramids,
    `${sheetId}:${from}:${to}`,
    locked,
  );

  return (
    <div className="compare">
      <RevisionBar sheetId={sheetId} from={from} to={to}>
        <ModeSwitch mode={mode} onModeChange={setMode} />
      </RevisionBar>
      <div className="compare-body" data-locked={locked}>
        {pyramids.status !== "ready" ? (
          <p className="compare-message">
            {pyramids.status === "loading"
              ? "Loading revisions…"
              : `${sheetId} REV ${from} → REV ${to} unavailable`}
          </p>
        ) : onion ? (
          <>
            <OnionPane
              from={pyramids.from}
              to={pyramids.to}
              opacity={blendOpacities(blend)}
              view={views.to}
              setView={setters.to}
              onResize={setPaneSize}
            />
            <OnionKey from={from} to={to} />
            <ZoomBar view={views.to} onZoom={zoomBoth} onFit={fitBoth} onLockedChange={setLocked}>
              <BlendSlider blend={blend} from={from} to={to} onBlendChange={setBlend} />
            </ZoomBar>
          </>
        ) : (
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
        )}
      </div>
    </div>
  );
}

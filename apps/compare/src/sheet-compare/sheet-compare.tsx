import { useCallback, useEffect, useRef, useState } from "react";

import "@gridline/platform/ui.css";

import { useChanges } from "../changes";
import type { ChangeRegion } from "../changes";
import { OnionPane, Pane } from "../pane";

import { blendOpacities } from "./blend";
import { BlendSlider } from "./blend-slider";
import { ChangesPanel } from "./changes-panel";
import { measureCompareShown } from "./compare-shown";
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

/* Stable, so a pane does not redraw for a new empty array each render. */
const NO_REGIONS: ChangeRegion[] = [];

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
  const ready = pyramids.status === "ready";
  const changes = useChanges(ready ? pyramids.from : null, ready ? pyramids.to : null);
  const regions = changes.status === "ready" ? changes.regions : NO_REGIONS;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // A new detection numbers its regions afresh.
  useEffect(() => setSelectedId(null), [changes]);
  const [mode, setModeState] = useState<CompareMode>("side");

  /* When this comparison was asked for, and how many panes have shown all of
     level 0. Side by side needs both; the onion draws both revisions at once. */
  const shown = useRef({ start: performance.now(), panes: 0, done: false });
  useEffect(() => {
    shown.current = { start: performance.now(), panes: 0, done: false };
  }, [sheetId, from, to]);
  const onShown = useCallback(() => {
    const s = shown.current;
    if (s.done) return;
    s.panes += 1;
    if (s.panes < (mode === "onion" ? 1 : 2)) return;
    s.done = true;
    measureCompareShown(s.start, { sheetId, from, to });
  }, [mode, sheetId, from, to]);
  const [blend, setBlend] = useState(50);
  const [lockedSetting, setLocked] = useState(true);

  const setMode = (next: CompareMode) => {
    if (next === "onion") setLocked(true);
    setModeState(next);
  };
  const select = (id: number) => {
    const region = regions.find((r) => r.id === id);
    if (!region) return;
    setSelectedId(id);
    frameBoth(region.rect);
  };
  /* Wraps at either end. With nothing chosen yet, next is the first and
     previous the last. */
  const step = (direction: 1 | -1) => {
    const n = regions.length;
    if (n === 0) return;
    const at = regions.findIndex((r) => r.id === selectedId);
    const next = at < 0 ? (direction === 1 ? 0 : n - 1) : (at + direction + n) % n;
    const region = regions[next];
    if (region) select(region.id);
  };

  const shiftHeld = useCompareKeys({
    l: () => mode === "side" && setLocked((l) => !l),
    o: () => setMode("onion"),
    s: () => setMode("side"),
    n: () => step(1),
    p: () => step(-1),
    f: () => fitBoth(),
  });
  const onion = mode === "onion";
  const locked = onion || (lockedSetting && !shiftHeld);

  const { views, setters, setPaneSize, zoomBoth, fitBoth, frameBoth } = usePaneViews(
    pyramids,
    `${sheetId}:${from}:${to}`,
    locked,
  );

  return (
    <div
      className="compare"
      data-changes={changes.status === "ready" ? changes.regions.length : changes.status}
    >
      <RevisionBar sheetId={sheetId} from={from} to={to}>
        <ModeSwitch mode={mode} onModeChange={setMode} />
      </RevisionBar>
      <div className="compare-main">
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
                regions={regions}
                selectedId={selectedId}
                view={views.to}
                setView={setters.to}
                onResize={setPaneSize}
                onShown={onShown}
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
                regions={regions}
                selectedId={selectedId}
                view={views.from}
                setView={setters.from}
                onResize={setPaneSize}
                onShown={onShown}
              />
              <Pane
                pyramid={pyramids.to}
                heading="TO"
                regions={regions}
                selectedId={selectedId}
                view={views.to}
                setView={setters.to}
                onShown={onShown}
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
        <ChangesPanel
          sheetId={sheetId}
          from={from}
          to={to}
          page={ready ? { width: pyramids.to.index.pageWidth, height: pyramids.to.index.pageHeight } : null}
          changes={changes}
          selectedId={selectedId}
          onSelect={select}
          onStep={step}
        />
      </div>
    </div>
  );
}

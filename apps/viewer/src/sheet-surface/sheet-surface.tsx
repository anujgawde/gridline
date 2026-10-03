import { useCallback, useEffect, useMemo, useState } from "react";

import { bus } from "@gridline/platform/bus";

import {
  CachePanel,
  cachePanelRequested,
  SheetProperties,
  SheetToolbar,
} from "../chrome";
import {
  FullPageRenderer,
  prefetchEnabled,
  selectRenderer,
  TiledRenderer,
} from "../renderers";
import type { TileStatsSource, ViewControls } from "../renderers";
import { loadSheetIndex, loadSheetSource } from "../sources";
import type { SheetIndexEntry, SheetSource } from "../sources";
import type { SheetSurfaceProps } from "./types";

/* The primitives' stylesheet is imported here, inside the exposed module,
   rather than only from this app's standalone entry. The shell loads
   SheetSurface over federation and never imports viewer's entry at all, so a
   stylesheet imported there would be missing exactly when the viewer is running
   where it matters. */
import "@gridline/platform/ui.css";
import "../chrome/chrome.css";
import "./sheet-surface.css";

interface Ready {
  source: SheetSource;
  index: SheetIndexEntry[];
}

/* One frozen instance, so "no neighbours" keeps a stable identity and does not
   re-trigger the effect it feeds. */
const EMPTY_NEIGHBOURS: string[] = [];

export function SheetSurface({ sheetId, revision }: SheetSurfaceProps) {
  const [ready, setReady] = useState<Ready | null>(null);
  const [resolved, setResolved] = useState(false);
  const [current, setCurrent] = useState(sheetId);
  /* Null until a renderer is mounted and has framed a sheet. The toolbar's zoom
     controls stay disabled rather than absent until then. */
  const [controls, setControls] = useState<ViewControls | null>(null);
  /* Only the tiled renderer has a tile cache to report on. */
  const [statsSource, setStatsSource] = useState<TileStatsSource | null>(null);
  const renderer = selectRenderer();
  /* Read once at mount rather than on every render: the query string does not
     change without a navigation, and a panel that could appear mid-session
     would be a layout shift over a drawing someone is reading. */
  const [showCachePanel] = useState(cachePanelRequested);
  const [prefetch] = useState(prefetchEnabled);

  /* The address of the set and the sheet-to-page mapping are both fetched, not
     compiled in, so they resolve after this component is already on screen.
     Neither blocks the first render; a failure leaves the surface saying so. */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const source = await loadSheetSource();
      if (cancelled) return;
      const index = source ? await loadSheetIndex(source) : null;
      if (cancelled) return;
      setReady(source && index ? { source, index } : null);
      setResolved(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* Navigation arrives over the bus, which is the only sanctioned cross-MFE
     channel. Whoever asks — the shell today, the navigator later — the viewer
     changes sheet without remounting, so a session accumulates rather than
     starting fresh on every sheet. */
  useEffect(
    () => bus.subscribe("sheet:open", ({ sheetId: next }) => setCurrent(next)),
    [],
  );

  useEffect(() => setCurrent(sheetId), [sheetId]);

  const announce = useCallback(
    (painted: string) => {
      bus.publish("sheet:loaded", {
        sheetId: painted,
        revision,
        pageCount: 1,
      });
    },
    [revision],
  );

  /* Stable, so publishing controls does not re-run the renderer's effect on
     every render of this component. */
  const takeControls = useCallback((next: ViewControls) => {
    setControls(next);
  }, []);

  /* The sheets either side of the open one, in set order — what someone reading
     a set reaches for next. Computed here because ordering a set is the index's
     business; the renderer is handed ids and has no opinion about adjacency.

     Memoised so its identity is stable: it drives a prefetch effect, and a fresh
     array every render would re-queue the neighbours on every render. */
  const neighbours = useMemo(() => {
    /* Withholding the neighbours is how prefetch is switched off: they exist
       only to be fetched ahead, so there is no separate flag to thread through
       the renderer. */
    if (!ready || !prefetch) return EMPTY_NEIGHBOURS;
    const at = ready.index.findIndex((sheet) => sheet.sheetId === current);
    if (at === -1) return EMPTY_NEIGHBOURS;
    return [ready.index[at - 1], ready.index[at + 1]]
      .filter((sheet): sheet is SheetIndexEntry => Boolean(sheet))
      .map((sheet) => sheet.sheetId);
  }, [ready, current, prefetch]);

  const takeStatsSource = useCallback((next: TileStatsSource) => {
    /* Wrapped in a thunk. A state setter handed a function treats it as an
       updater, so passing the getter directly would call it and store its
       reading instead of keeping the getter. */
    setStatsSource(() => next);
  }, []);

  if (!resolved) {
    return (
      <div className="viewer-surface">
        <p className="viewer-render-message">Locating sheet set…</p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="viewer-surface">
        <p className="viewer-render-message">Sheet set unavailable</p>
      </div>
    );
  }

  const entry = ready.index.find((sheet) => sheet.sheetId === current);

  return (
    <div className="viewer-shell">
      <div className="viewer-surface">
        {renderer === "tiled" ? (
          <TiledRenderer
            sheetId={current}
            source={ready.source}
            onPainted={announce}
            onControls={takeControls}
            onStatsSource={takeStatsSource}
            neighbours={neighbours}
          />
        ) : (
          <FullPageRenderer
            sheetId={current}
            source={ready.source}
            index={ready.index}
            onPainted={announce}
            onControls={takeControls}
          />
        )}
        <SheetToolbar controls={controls} />
        {showCachePanel && <CachePanel source={statsSource} />}
      </div>
      <SheetProperties
        sheetId={current}
        revision={revision}
        entry={entry}
        renderer={renderer}
      />
    </div>
  );
}

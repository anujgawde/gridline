import { useCallback, useEffect, useState } from "react";

import { bus } from "@gridline/platform/bus";

import { SheetProperties, SheetToolbar } from "../chrome";
import { FullPageRenderer, selectRenderer, TiledRenderer } from "../renderers";
import type { ViewControls } from "../renderers";
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

export function SheetSurface({ sheetId, revision }: SheetSurfaceProps) {
  const [ready, setReady] = useState<Ready | null>(null);
  const [resolved, setResolved] = useState(false);
  const [current, setCurrent] = useState(sheetId);
  /* Null until a renderer is mounted and has framed a sheet. The toolbar's zoom
     controls stay disabled rather than absent until then. */
  const [controls, setControls] = useState<ViewControls | null>(null);
  const renderer = selectRenderer();

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

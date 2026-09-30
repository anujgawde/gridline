import { useCallback, useEffect, useState } from "react";

import { bus } from "@gridline/platform/bus";

import { FullPageRenderer, selectRenderer, TiledRenderer } from "../renderers";
import { loadSheetIndex, loadSheetSource } from "../sources";
import type { SheetIndexEntry, SheetSource } from "../sources";
import type { SheetSurfaceProps } from "./types";
import "./sheet-surface.css";

interface Ready {
  source: SheetSource;
  index: SheetIndexEntry[];
}

export function SheetSurface({ sheetId, revision }: SheetSurfaceProps) {
  const [ready, setReady] = useState<Ready | null>(null);
  const [resolved, setResolved] = useState(false);
  const [current, setCurrent] = useState(sheetId);
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

  return (
    <div className="viewer-surface">
      {renderer === "tiled" ? (
        <TiledRenderer
          sheetId={current}
          source={ready.source}
          onPainted={announce}
        />
      ) : (
        <FullPageRenderer
          sheetId={current}
          source={ready.source}
          index={ready.index}
          onPainted={announce}
        />
      )}
    </div>
  );
}

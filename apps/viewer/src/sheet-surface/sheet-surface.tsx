import { useCallback, useEffect, useState } from "react";

import { bus } from "@gridline/platform/bus";

import { FullPageRenderer, selectRenderer } from "../renderers";
import { loadSheetSource, sheetUrl } from "../sources";
import type { SheetSource } from "../sources";
import type { SheetSurfaceProps } from "./types";
import "./sheet-surface.css";

export function SheetSurface({ sheetId, revision }: SheetSurfaceProps) {
  const [source, setSource] = useState<SheetSource | null>(null);
  const [resolved, setResolved] = useState(false);
  const renderer = selectRenderer();

  /* The address of the set is fetched, not compiled in, so this resolves after
     the component is already on screen. Nothing here blocks the first render:
     a lookup that fails leaves `source` null and the surface says so. */
  useEffect(() => {
    let cancelled = false;
    void loadSheetSource().then((value) => {
      if (cancelled) return;
      setSource(value);
      setResolved(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /* Announced when the sheet is actually on the canvas rather than when the
     component mounted, so a host listening on the bus is told about a sheet that
     exists rather than one that is still being parsed. */
  const announce = useCallback(() => {
    bus.publish("sheet:loaded", { sheetId, revision, pageCount: 1 });
  }, [sheetId, revision]);

  if (!resolved) {
    return (
      <div className="viewer-surface">
        <p className="viewer-render-message">Locating sheet set…</p>
      </div>
    );
  }

  if (!source) {
    return (
      <div className="viewer-surface">
        <p className="viewer-render-message">Sheet set unavailable</p>
      </div>
    );
  }

  return (
    <div className="viewer-surface">
      {renderer === "fullpage" && (
        <FullPageRenderer
          sheetId={sheetId}
          url={sheetUrl(source, sheetId)}
          onPainted={announce}
        />
      )}
    </div>
  );
}

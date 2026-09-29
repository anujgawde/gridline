import { useEffect } from "react";

import { bus } from "@gridline/platform/bus";

import type { SheetSurfaceProps } from "./types";
import "./sheet-surface.css";

export function SheetSurface({ sheetId, revision }: SheetSurfaceProps) {
  useEffect(() => {
    bus.publish("sheet:loaded", { sheetId, revision, pageCount: 1 });
  }, [sheetId, revision]);

  return (
    <div className="viewer-surface">
      <div className="viewer-sheet">
        <span className="viewer-sheet-id">{sheetId}</span>
        <span className="viewer-sheet-note">
          rendered by the viewer remote
        </span>
      </div>
    </div>
  );
}

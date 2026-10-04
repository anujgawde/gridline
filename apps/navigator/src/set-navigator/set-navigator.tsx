import { useEffect, useState } from "react";

import { bus } from "@gridline/platform/bus";

import { SheetGrid } from "./sheet-grid";
import type { SetNavigatorProps } from "./types";

/* Imported inside the exposed module, not the standalone entry: the shell never
   loads this app's entry, so a stylesheet imported there would be missing. */
import "@gridline/platform/ui.css";
import "./set-navigator.css";

export function SetNavigator({ layout }: SetNavigatorProps) {
  return layout === "grid" ? <SheetGrid /> : <OpenSheetPanel />;
}

/* The open sheet comes from `sheet:loaded`, published by the viewer. If the bus
   were bundled twice this line would stay empty with no error anywhere, so it
   doubles as the check that the bus is one shared instance. */
function OpenSheetPanel() {
  const [openSheet, setOpenSheet] = useState<string | null>(null);

  useEffect(
    () => bus.subscribe("sheet:loaded", ({ sheetId }) => setOpenSheet(sheetId)),
    [],
  );

  return (
    <nav className="set-navigator" aria-label="Sheets">
      <h2 className="set-navigator-heading">Sheets</h2>
      <p className="set-navigator-open">
        {openSheet ? `Open: ${openSheet}` : "No sheet open"}
      </p>
    </nav>
  );
}

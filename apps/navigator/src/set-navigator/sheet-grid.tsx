import { useEffect, useMemo, useState } from "react";

import { loadSheetIndex, loadSheetSource } from "../sources";
import type { SheetIndexEntry } from "../sources";
import { FullGrid } from "./full-grid";
import { gridMode } from "./grid-mode";
import { markIndexLoaded } from "./grid-shown";
import { groupByDiscipline } from "./group";
import { VirtualGrid } from "./virtual-grid";

type Load =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "ready"; sheets: SheetIndexEntry[]; baseUrl: string };

/* The whole set, grouped by discipline. Drawn by the virtual grid unless
   `?grid=full` asks for the baseline. */
export function SheetGrid() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [mode] = useState(gridMode);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const source = await loadSheetSource();
      const sheets = source ? await loadSheetIndex(source) : null;
      if (sheets) markIndexLoaded();
      if (!cancelled) {
        setLoad(
          source && sheets
            ? { state: "ready", sheets, baseUrl: source.baseUrl }
            : { state: "failed" },
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(
    () => (load.state === "ready" ? groupByDiscipline(load.sheets) : []),
    [load],
  );

  if (load.state !== "ready") {
    return (
      <div className="sheet-grid-status">
        {load.state === "loading" ? "Loading sheets…" : "Sheet list unavailable"}
      </div>
    );
  }

  const Grid = mode === "full" ? FullGrid : VirtualGrid;

  return (
    <div className="sheet-grid-view">
      <header className="sheet-grid-header">
        <h2 className="sheet-grid-title">Sheets</h2>
        <span className="sheet-grid-count">
          {load.sheets.length.toLocaleString("en-US")} sheets
        </span>
      </header>

      <Grid groups={groups} count={load.sheets.length} baseUrl={load.baseUrl} />
    </div>
  );
}

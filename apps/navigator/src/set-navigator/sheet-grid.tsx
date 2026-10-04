import { useEffect, useMemo, useRef, useState } from "react";

import { loadSheetIndex, loadSheetSource } from "../sources";
import type { SheetIndexEntry } from "../sources";
import { DisciplineFilter } from "./discipline-filter";
import { FullGrid } from "./full-grid";
import { gridMode } from "./grid-mode";
import { markIndexLoaded, measureFilterApplied } from "./grid-shown";
import { filterGroups, groupByDiscipline } from "./group";
import { VirtualGrid } from "./virtual-grid";

type Load =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "ready"; sheets: SheetIndexEntry[]; baseUrl: string };

const NOTHING_HIDDEN: ReadonlySet<string> = new Set();

/* The whole set, grouped by discipline and filtered by it. Drawn by the
   virtual grid unless `?grid=full` asks for the baseline.

   A filter hands the grid fewer groups and nothing else: the grid lays out
   whatever it is given, so filtering costs a new row layout and the rows now
   on screen, never a card per sheet. */
export function SheetGrid() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [mode] = useState(gridMode);
  const [hidden, setHidden] = useState(NOTHING_HIDDEN);
  /* The input timestamp of the toggle being applied, or null when the last
     change came from anywhere else. */
  const toggledAt = useRef<number | null>(null);

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

  const shownGroups = useMemo(() => filterGroups(groups, hidden), [groups, hidden]);

  useEffect(() => {
    if (toggledAt.current === null) return;
    measureFilterApplied(toggledAt.current);
    toggledAt.current = null;
  }, [hidden]);

  const toggle = (discipline: string, at: number) => {
    toggledAt.current = at;
    setHidden((prev) => {
      const next = new Set(prev);
      if (!next.delete(discipline)) next.add(discipline);
      return next;
    });
  };

  const clear = (at: number) => {
    toggledAt.current = at;
    setHidden(NOTHING_HIDDEN);
  };

  if (load.state !== "ready") {
    return (
      <div className="sheet-grid-status">
        {load.state === "loading" ? "Loading sheets…" : "Sheet list unavailable"}
      </div>
    );
  }

  const Grid = mode === "full" ? FullGrid : VirtualGrid;
  const total = load.sheets.length;
  const shown = shownGroups.reduce((sum, group) => sum + group.sheets.length, 0);

  return (
    <div className="sheet-grid-view">
      <header className="sheet-grid-header">
        <h2 className="sheet-grid-title">Sheets</h2>
        <span className="sheet-grid-count">
          {shown === total
            ? `${total.toLocaleString("en-US")} sheets`
            : `${shown.toLocaleString("en-US")} / ${total.toLocaleString("en-US")} sheets`}
        </span>
        <DisciplineFilter groups={groups} hidden={hidden} onToggle={toggle} onClear={clear} />
      </header>

      {shownGroups.length > 0 ? (
        <Grid groups={shownGroups} count={shown} baseUrl={load.baseUrl} />
      ) : (
        <div className="sheet-grid-status">No disciplines selected</div>
      )}
    </div>
  );
}

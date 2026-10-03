import { useEffect, useMemo, useState } from "react";

import { loadSheetIndex, loadSheetSource } from "../sources";
import type { SheetIndexEntry } from "../sources";
import { groupByDiscipline } from "./group";

type Load =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "ready"; sheets: SheetIndexEntry[] };

/* Every sheet in the set rendered as a DOM card, all at once. Deliberately the
   slow version: it is the "before" the virtualised grid is measured against,
   and that reading cannot be recovered once this is replaced.

   The thumbnail box is drawn at its final size now, empty, so the card being
   measured is the same card the fast version will render. */
export function SheetGrid() {
  const [load, setLoad] = useState<Load>({ state: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const source = await loadSheetSource();
      const sheets = source ? await loadSheetIndex(source) : null;
      if (!cancelled) setLoad(sheets ? { state: "ready", sheets } : { state: "failed" });
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

  return (
    <div className="sheet-grid-view">
      <header className="sheet-grid-header">
        <h2 className="sheet-grid-title">Sheets</h2>
        <span className="sheet-grid-count">
          {load.sheets.length.toLocaleString("en-US")} sheets
        </span>
      </header>

      <div className="sheet-grid" data-sheet-count={load.sheets.length}>
        {groups.map((group) => (
          <section key={group.discipline} className="sheet-grid-section">
            <h3 className="sheet-grid-section-heading">
              <span className="sheet-grid-section-name">
                {group.discipline} · {group.name}
              </span>
              <span className="sheet-grid-section-count">
                {group.sheets.length} sheets
              </span>
            </h3>
            {group.sheets.map((sheet) => (
              <article key={sheet.sheetId} className="sheet-card">
                <div className="sheet-card-thumb" aria-hidden="true" />
                <div className="sheet-card-body">
                  <span className="sheet-card-number">{sheet.sheetId}</span>
                  <span className="sheet-card-title">{sheet.title}</span>
                </div>
              </article>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

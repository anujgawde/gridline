import { useEffect, useMemo, useRef, useState } from "react";

import { bus } from "@gridline/platform/bus";
import { Panel, PanelHeader } from "@gridline/platform/ui";

import { groupByDiscipline } from "./group";
import { openSheet } from "./open-sheet";
import { useSheetIndex } from "./use-sheet-index";
import { VirtualGrid } from "./virtual-grid";

/* The set as a list beside the drawing. The same virtual grid as the
   full-screen view, one row per sheet.

   The open sheet comes from `sheet:loaded`, published by the viewer once a
   sheet is on screen, so the mark follows what is shown rather than what was
   asked for. If the bus were bundled twice nothing would ever be marked, with
   no error anywhere, so this doubles as the check that it is one instance. */
export function SheetPanel() {
  const load = useSheetIndex();
  const [openSheetId, setOpenSheetId] = useState<string | null>(null);

  useEffect(
    () => bus.subscribe("sheet:loaded", ({ sheetId }) => setOpenSheetId(sheetId)),
    [],
  );

  const groups = useMemo(
    () => (load.state === "ready" ? groupByDiscipline(load.sheets) : []),
    [load],
  );

  /* The set in the order the list shows it, for stepping through. */
  const order = useMemo(() => groups.flatMap((group) => group.sheets), [groups]);

  /* The sheet last asked for, by anyone. Stepping counts from this rather
     than from the sheet on screen, so pressing twice before the first has
     painted moves two sheets, not one twice. */
  const requested = useRef<string | null>(null);
  useEffect(() => bus.subscribe("sheet:open", ({ sheetId }) => (requested.current = sheetId)), []);

  /* Shift+Up and Shift+Down open the previous and next sheet from anywhere on
     the page, with no focus needed — the drawing keeps the plain arrows. They
     run through every discipline in the list's order. Ignored while typing,
     where Shift+arrow selects text. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const from = requested.current ?? openSheetId;
      const at = order.findIndex((sheet) => sheet.sheetId === from);
      if (at === -1) return;
      const next = order[at + (event.key === "ArrowDown" ? 1 : -1)];
      event.preventDefault();
      if (next) openSheet(next.sheetId);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [order, openSheetId]);

  return (
    <Panel
      side="left"
      data-sheet-panel=""
      aria-label="Sheets"
      footer={<KeyHints />}
      header={
        <PanelHeader
          title="Sheet index"
          meta={
            load.state === "ready"
              ? `${load.sheets.length.toLocaleString("en-US")} sheets`
              : undefined
          }
        />
      }
    >
      {load.state === "ready" ? (
        <VirtualGrid
          groups={groups}
          count={load.sheets.length}
          baseUrl={load.baseUrl}
          variant="list"
          openSheetId={openSheetId}
        />
      ) : (
        <div className="sheet-grid-status">
          {load.state === "loading" ? "Loading sheets…" : "Sheet list unavailable"}
        </div>
      )}
    </Panel>
  );
}

/* The shortcut, where someone looking for it will find it. */
function KeyHints() {
  return (
    <dl className="sheet-panel-keys">
      <div>
        <dt>
          <kbd>Shift</kbd> <kbd>↑</kbd> <kbd>↓</kbd>
        </dt>
        <dd>Previous / next sheet</dd>
      </div>
    </dl>
  );
}

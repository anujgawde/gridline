import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent } from "react";

import { ListItem } from "@gridline/platform/ui";

import type { SheetIndexEntry } from "../sources";

import { thumbnailsEnabled } from "./grid-mode";
import { markGridShown } from "./grid-shown";
import { openSheet } from "./open-sheet";
import { ThumbnailLoader } from "./thumbnail-loader";
import { SectionLabel, SheetCard } from "./sheet-card";
import type {
  DisciplineGroup,
  GridRow,
  GridVariant,
  RowMetrics,
  RowRange,
  ThumbnailServices,
} from "./types";
import { ThumbnailContext } from "./use-thumbnail";
import { layoutRows, moveFrom, sectionAt, visibleRows } from "./virtual-rows";
import { VisibilityWatcher } from "./visibility";

/* Rows drawn beyond each edge of the viewport, as a fraction of its height, so
   a fast scroll finds the next rows already in the DOM. */
const OVERSCAN = 0.5;

/* Scrolls `row` into view by the least distance that does it. The pinned
   heading covers the top of the viewport, so a row under it counts as hidden.
   Nothing moves for a row already in view. */
function reveal(scroller: HTMLElement, row: GridRow, headingHeight: number) {
  const top = scroller.scrollTop + headingHeight;
  const bottom = scroller.scrollTop + scroller.clientHeight;
  if (row.top < top) scroller.scrollTop = row.top - headingHeight;
  else if (row.top + row.height > bottom) scroller.scrollTop = row.top + row.height - scroller.clientHeight;
}

/* The sheet element drawn for `sheetId`, never the probe's copy. */
function drawnItem(scroller: HTMLElement, sheetId: string) {
  return scroller.querySelector<HTMLElement>(
    `.sheet-grid-placed [data-sheet-id="${CSS.escape(sheetId)}"]`,
  );
}

const NAVIGATION_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"]);

interface Drawn {
  range: RowRange;
  section: number;
}

/* Only the rows near the viewport exist in the DOM. The canvas keeps the whole
   list's height, so the scrollbar still describes all of it, and each drawn row
   is placed at its computed offset.

   Row sizes are measured from a hidden probe — one heading and one card row
   styled exactly as the real ones — rather than written down here. A card's
   height follows its width, which follows the viewport, so any constant would
   be right at one window size only.

   The `list` variant is the same layout with one column of rows instead of
   cards, so the panel beside a drawing is this grid, not a second one. */
export function VirtualGrid({
  groups,
  count,
  baseUrl,
  variant = "cards",
  openSheetId = null,
}: {
  groups: DisciplineGroup[];
  count: number;
  baseUrl: string;
  variant?: GridVariant;
  /* The sheet the viewer is showing, marked and kept in view. */
  openSheetId?: string | null;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const probeHeadingRef = useRef<HTMLHeadingElement>(null);
  const probeRowRef = useRef<HTMLDivElement>(null);

  const [metrics, setMetrics] = useState<RowMetrics | null>(null);
  const [view, setView] = useState<Drawn>({ range: { start: 0, end: 0 }, section: 0 });
  /* The sheet keyboard focus is on, or last was. One item is in the tab order
     at a time — this one when drawn — so Tab enters the grid once and the
     arrows move within it. */
  const [activeId, setActiveId] = useState<string | null>(null);
  /* A sheet the arrows moved to, focused once its row has been drawn. */
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);

  const thumbnails = useMemo<ThumbnailServices | null>(
    () =>
      variant === "cards" && thumbnailsEnabled()
        ? { loader: new ThumbnailLoader(baseUrl), watcher: new VisibilityWatcher() }
        : null,
    [baseUrl, variant],
  );
  useEffect(() => () => thumbnails?.watcher.disconnect(), [thumbnails]);

  const layout = useMemo(() => (metrics ? layoutRows(groups, metrics) : null), [groups, metrics]);

  useLayoutEffect(() => {
    const heading = probeHeadingRef.current;
    const row = probeRowRef.current;
    if (!heading || !row) return;

    const measure = () => {
      const style = getComputedStyle(row);
      const next: RowMetrics = {
        /* The resolved track list, one length per column. auto-fill keeps
           empty tracks, so this counts columns even with one card present. */
        columns: style.gridTemplateColumns.split(" ").length,
        cardHeight: row.getBoundingClientRect().height,
        headingHeight: heading.getBoundingClientRect().height,
        gap: parseFloat(style.rowGap) || 0,
      };
      setMetrics((prev) =>
        prev &&
        prev.columns === next.columns &&
        prev.cardHeight === next.cardHeight &&
        prev.headingHeight === next.headingHeight &&
        prev.gap === next.gap
          ? prev
          : next,
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    observer.observe(heading);
    return () => observer.disconnect();
  }, []);

  /* Re-derives which rows to draw. State changes only when the range or the
     pinned section does, so most scroll events cost a binary search and no
     render. */
  const update = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !layout) return;
    const { scrollTop, clientHeight } = scroller;
    const range = visibleRows(layout.rows, scrollTop, clientHeight, clientHeight * OVERSCAN);
    const section = sectionAt(layout.rows, scrollTop);
    setView((prev) =>
      prev.range.start === range.start &&
      prev.range.end === range.end &&
      prev.section === section
        ? prev
        : { range, section },
    );
  }, [layout]);

  /* A filter change is a different list, and an offset into the old one means
     nothing in it. Ahead of the effect below, so the first range drawn for the
     new list is read from the top. */
  useLayoutEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
  }, [groups]);

  /* Brings the open sheet's row into view, so a sheet opened from elsewhere
     is found in the list, and makes it the keyboard's starting point. Opened
     from here, its row is already in view and nothing moves. */
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !layout || !metrics || !openSheetId) return;
    const row = layout.rows.find(
      (r) => r.kind === "cards" && r.sheets.some((sheet) => sheet.sheetId === openSheetId),
    );
    if (!row) return;
    reveal(scroller, row, metrics.headingHeight);
    setActiveId(openSheetId);
  }, [openSheetId, layout, metrics]);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    update();
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [update]);

  /* Focus moves only once the target's row is in the DOM: a row the arrows
     reach may be outside the drawn range until the scroll that reveals it has
     been rendered. Focused without scrolling, since `reveal` already placed it
     clear of the pinned heading. */
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !pendingFocus) return;
    const item = drawnItem(scroller, pendingFocus);
    if (!item) return;
    item.focus({ preventScroll: true });
    setPendingFocus(null);
  }, [pendingFocus, view]);

  /* Cards only: arrows, Home and End move between sheets; Enter and Space
     need nothing here, since every item is a button. The list beside a
     drawing has none of this — Shift+Up and Shift+Down step through the set
     from anywhere instead (see SheetPanel).

   From a focused sheet, a key moves to the next one. From anywhere else in the
   grid — the scroller itself, which a click on it focuses in every browser —
   it first puts focus on the selected sheet, so the keys work without a sheet
   having to be focused first. Returns whether it acted; a key it ignores is
   left to the browser, so the scroller still scrolls. */
  const navigate = (target: EventTarget | null, key: string) => {
    const scroller = scrollerRef.current;
    if (variant !== "cards" || !scroller || !layout || !metrics || !NAVIGATION_KEYS.has(key)) {
      return false;
    }
    const from = (target as HTMLElement | null)?.closest?.("[data-sheet-id]")?.getAttribute("data-sheet-id");

    if (!from) {
      const selected = activeId ?? layout.rows.find((row) => row.kind === "cards")?.sheets[0]?.sheetId;
      const rowIndex = layout.rows.findIndex(
        (row) => row.kind === "cards" && row.sheets.some((sheet) => sheet.sheetId === selected),
      );
      if (!selected || rowIndex === -1) return false;
      reveal(scroller, layout.rows[rowIndex]!, metrics.headingHeight);
      update();
      setActiveId(selected);
      setPendingFocus(selected);
      return true;
    }

    const to = moveFrom(layout.rows, from, key);
    if (!to) return false;
    reveal(scroller, layout.rows[to.rowIndex]!, metrics.headingHeight);
    update();
    setActiveId(to.sheetId);
    setPendingFocus(to.sheetId);
    return true;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (navigate(event.target, event.key)) event.preventDefault();
  };

  /* The full-screen grid is the whole page, so it also takes the keys when
     nothing has focus — as it is straight after loading. */
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  useEffect(() => {
    if (variant !== "cards") return;
    const onDocumentKey = (event: globalThis.KeyboardEvent) => {
      if (document.activeElement !== document.body) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (navigateRef.current(null, event.key)) event.preventDefault();
    };
    document.addEventListener("keydown", onDocumentKey);
    return () => document.removeEventListener("keydown", onDocumentKey);
  }, [variant]);

  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    const id = (event.target as HTMLElement).closest("[data-sheet-id]")?.getAttribute("data-sheet-id");
    if (id) setActiveId(id);
  };

  const drawnRows = layout?.rows.slice(view.range.start, view.range.end) ?? [];
  const drawnSheets = drawnRows.flatMap((row) => (row.kind === "cards" ? row.sheets : []));
  const tabStop =
    activeId && drawnSheets.some((sheet) => sheet.sheetId === activeId)
      ? activeId
      : (drawnSheets[0]?.sheetId ?? null);

  /* The first render draws only the probe; cards follow once it is measured. */
  const drawn = view.range.end > view.range.start;
  useEffect(() => {
    if (drawn) markGridShown();
  }, [drawn]);

  const sample = groups[0];
  const pinned = groups[view.section];

  return (
    <ThumbnailContext.Provider value={thumbnails}>
      <div
        ref={scrollerRef}
        className={`sheet-grid sheet-grid-virtual${variant === "list" ? " sheet-list" : ""}`}
        onScroll={update}
        /* Cards: focusable by click and script, not by Tab — Tab lands on the
           selected sheet instead. A click anywhere in the grid focuses this,
           which is what lets the keys work after one. */
        tabIndex={variant === "cards" ? -1 : undefined}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        /* Written only once rows are drawn, so a reader of this attribute knows
           the grid has rendered, as it does for the full grid. */
        data-sheet-count={layout ? count : undefined}
      >
        {/* The current section's heading, pinned. A heading row that has scrolled
            out of the drawn range is removed, and position: sticky goes with it,
            so the pin has to be a separate element. Takes no layout space. */}
        {layout && metrics && pinned && (
          <h3
            className="sheet-grid-section-heading sheet-grid-pinned"
            style={{ marginBottom: -metrics.headingHeight }}
            aria-hidden="true"
          >
            <SectionLabel group={pinned} />
          </h3>
        )}

        <div className="sheet-grid-canvas" style={{ height: layout?.height ?? 0 }}>
          {sample && (
            <div className="sheet-grid-probe" aria-hidden="true">
              <h3 ref={probeHeadingRef} className="sheet-grid-section-heading">
                <SectionLabel group={sample} />
              </h3>
              <div ref={probeRowRef} className="sheet-grid-row">
                {sample.sheets[0] && (
                  <Item sheet={sample.sheets[0]} variant={variant} open={false} probe />
                )}
              </div>
            </div>
          )}

          {drawnRows.map((row) =>
            row.kind === "heading" ? (
              /* The pinned section's own heading is transparent: scrolling
                 up under the pin, a step out of line with it, it read as a
                 second copy. Transparent rather than removed, so it stays in
                 the accessibility tree — the pin is aria-hidden. */
              <h3
                key={row.key}
                className={`sheet-grid-section-heading sheet-grid-placed${
                  row.section === view.section ? " sheet-grid-under-pin" : ""
                }`}
                style={{ transform: `translateY(${row.top}px)` }}
              >
                <SectionLabel group={row.group} />
              </h3>
            ) : (
              <div
                key={row.key}
                className="sheet-grid-row sheet-grid-placed"
                style={{ transform: `translateY(${row.top}px)` }}
              >
                {row.sheets.map((sheet) => (
                  <Item
                    key={sheet.sheetId}
                    sheet={sheet}
                    variant={variant}
                    open={sheet.sheetId === openSheetId}
                    tabStop={sheet.sheetId === tabStop}
                  />
                ))}
              </div>
            ),
          )}
        </div>
      </div>
    </ThumbnailContext.Provider>
  );
}

/* One sheet, drawn as the variant asks. A probe never fetches a thumbnail. */
function Item({
  sheet,
  variant,
  open,
  tabStop = false,
  probe = false,
}: {
  sheet: SheetIndexEntry;
  variant: GridVariant;
  open: boolean;
  tabStop?: boolean;
  probe?: boolean;
}) {
  /* Cards keep one tab stop and move by arrow. List rows are plain buttons,
     each reached by Tab. */
  if (variant === "cards") {
    return <SheetCard sheet={sheet} thumbnail={!probe} tabIndex={tabStop ? 0 : -1} />;
  }
  return (
    <ListItem
      code={sheet.sheetId}
      title={sheet.title}
      selected={open}
      data-sheet-id={sheet.sheetId}
      tabIndex={probe ? -1 : undefined}
      onClick={() => openSheet(sheet.sheetId)}
    />
  );
}

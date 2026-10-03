import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { markGridShown } from "./grid-shown";
import { SectionLabel, SheetCard } from "./sheet-card";
import type { DisciplineGroup, RowMetrics, RowRange } from "./types";
import { layoutRows, sectionAt, visibleRows } from "./virtual-rows";

/* Rows drawn beyond each edge of the viewport, as a fraction of its height, so
   a fast scroll finds the next rows already in the DOM. */
const OVERSCAN = 0.5;

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
   be right at one window size only. */
export function VirtualGrid({ groups, count }: { groups: DisciplineGroup[]; count: number }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const probeHeadingRef = useRef<HTMLHeadingElement>(null);
  const probeRowRef = useRef<HTMLDivElement>(null);

  const [metrics, setMetrics] = useState<RowMetrics | null>(null);
  const [view, setView] = useState<Drawn>({ range: { start: 0, end: 0 }, section: 0 });

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

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    update();
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [update]);

  /* The first render draws only the probe; cards follow once it is measured. */
  const drawn = view.range.end > view.range.start;
  useEffect(() => {
    if (drawn) markGridShown();
  }, [drawn]);

  const sample = groups[0];
  const pinned = groups[view.section];

  return (
    <div
      ref={scrollerRef}
      className="sheet-grid sheet-grid-virtual"
      onScroll={update}
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
              {sample.sheets[0] && <SheetCard sheet={sample.sheets[0]} />}
            </div>
          </div>
        )}

        {layout?.rows.slice(view.range.start, view.range.end).map((row) =>
          row.kind === "heading" ? (
            <h3
              key={row.key}
              className="sheet-grid-section-heading sheet-grid-placed"
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
                <SheetCard key={sheet.sheetId} sheet={sheet} />
              ))}
            </div>
          ),
        )}
      </div>
    </div>
  );
}

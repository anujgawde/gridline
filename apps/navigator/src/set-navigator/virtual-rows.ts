import type { DisciplineGroup, GridRow, RowLayout, RowMetrics, RowRange } from "./types";

/* The whole set flattened into rows, each with its offset from the top. A
   heading is a row of its own, so rows are uneven heights and a row's position
   cannot be computed as index × height — it is accumulated once, here, and every
   lookup after that is a binary search over the offsets. */
export function layoutRows(groups: DisciplineGroup[], metrics: RowMetrics): RowLayout {
  const columns = Math.max(1, Math.floor(metrics.columns));
  const rows: GridRow[] = [];
  let top = 0;

  const place = (row: GridRow) => {
    if (rows.length > 0) top += metrics.gap;
    row.top = top;
    rows.push(row);
    top += row.height;
  };

  groups.forEach((group, section) => {
    place({
      kind: "heading",
      key: `h:${group.discipline}`,
      section,
      top: 0,
      height: metrics.headingHeight,
      group,
    });
    for (let i = 0; i < group.sheets.length; i += columns) {
      place({
        kind: "cards",
        key: `r:${group.discipline}:${i / columns}`,
        section,
        top: 0,
        height: metrics.cardHeight,
        sheets: group.sheets.slice(i, i + columns),
      });
    }
  });

  return { rows, height: top };
}

/* The rows that intersect the viewport, widened by `overscan` pixels on each
   side so a fast scroll finds the next rows already drawn. */
export function visibleRows(
  rows: GridRow[],
  scrollTop: number,
  viewportHeight: number,
  overscan: number,
): RowRange {
  const from = scrollTop - overscan;
  const to = scrollTop + viewportHeight + overscan;
  /* First row whose bottom is below `from`, and first row whose top is at or
     past `to`. Both offsets rise monotonically, so both are binary searches. */
  const start = firstIndex(rows, (row) => row.top + row.height > from);
  const end = firstIndex(rows, (row) => row.top >= to);
  return { start, end: Math.max(start, end) };
}

/* The section whose content is at `offset` — what the pinned heading names. A
   gap between rows belongs to the row above it. */
export function sectionAt(rows: GridRow[], offset: number): number {
  const index = firstIndex(rows, (row) => row.top > offset) - 1;
  return rows[Math.max(0, index)]?.section ?? 0;
}

/* Index of the first row satisfying `test`, or `rows.length` if none does.
   `test` must be false for some prefix of the rows and true for the rest. */
function firstIndex(rows: GridRow[], test: (row: GridRow) => boolean): number {
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (test(rows[mid]!)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

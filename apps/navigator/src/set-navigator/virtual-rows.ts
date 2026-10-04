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

/* The sheet a navigation key moves to from `sheetId`, with the index of the
   row holding it, or null when the key moves nowhere.

   Left and Right stay within a row, and Up and Down keep the column, landing
   on the last card of a shorter row — so a section's ragged last row is never
   skipped. Headings are passed over. Home and End go to the first and last
   sheet. One column makes this a list: Left and Right do nothing there. */
export function moveFrom(
  rows: GridRow[],
  sheetId: string,
  key: string,
): { sheetId: string; rowIndex: number } | null {
  const cardRows: number[] = [];
  let at = -1;
  let column = -1;
  rows.forEach((row, index) => {
    if (row.kind !== "cards") return;
    const found = row.sheets.findIndex((sheet) => sheet.sheetId === sheetId);
    if (found !== -1) {
      at = cardRows.length;
      column = found;
    }
    cardRows.push(index);
  });
  if (at === -1) return null;

  const pick = (position: number, col: number) => {
    const rowIndex = cardRows[position];
    if (rowIndex === undefined) return null;
    const row = rows[rowIndex]!;
    if (row.kind !== "cards") return null;
    const sheet = row.sheets[Math.min(col, row.sheets.length - 1)];
    return sheet ? { sheetId: sheet.sheetId, rowIndex } : null;
  };
  const here = rows[cardRows[at]!]!;
  const width = here.kind === "cards" ? here.sheets.length : 0;

  switch (key) {
    case "ArrowLeft":
      return column > 0 ? pick(at, column - 1) : null;
    case "ArrowRight":
      return column < width - 1 ? pick(at, column + 1) : null;
    case "ArrowUp":
      return pick(at - 1, column);
    case "ArrowDown":
      return pick(at + 1, column);
    case "Home":
      return pick(0, 0);
    case "End":
      return pick(cardRows.length - 1, Number.MAX_SAFE_INTEGER);
    default:
      return null;
  }
}

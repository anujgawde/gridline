import type { SheetIndexEntry } from "../sources";

export type SetNavigatorLayout = "grid" | "panel";

export interface SetNavigatorProps {
  layout: SetNavigatorLayout;
}

export interface DisciplineGroup {
  discipline: string;
  name: string;
  sheets: SheetIndexEntry[];
}

/* `virtual` draws only the rows near the viewport; `full` draws every card and
   is kept as the measured baseline. */
export type GridMode = "virtual" | "full";

/* Sizes the row layout is computed from, all in CSS pixels. Measured from the
   rendered grid rather than assumed, since a card's height follows its width. */
export interface RowMetrics {
  columns: number;
  cardHeight: number;
  headingHeight: number;
  /* Vertical space between consecutive rows, headings included. */
  gap: number;
}

interface RowBase {
  key: string;
  /* Index of the discipline group this row belongs to. */
  section: number;
  top: number;
  height: number;
}

export type GridRow =
  | (RowBase & { kind: "heading"; group: DisciplineGroup })
  | (RowBase & { kind: "cards"; sheets: SheetIndexEntry[] });

export interface RowLayout {
  rows: GridRow[];
  /* From the top of the first row to the bottom of the last. */
  height: number;
}

/* Rows to render, as a half-open range of indexes into `RowLayout.rows`. */
export interface RowRange {
  start: number;
  end: number;
}

import { describe, expect, it } from "vitest";

import type { DisciplineGroup, RowMetrics } from "../types";
import { layoutRows, sectionAt, visibleRows } from "../virtual-rows";

const group = (discipline: string, count: number): DisciplineGroup => ({
  discipline,
  name: discipline,
  sheets: Array.from({ length: count }, (_, i) => ({
    sheetId: `${discipline}-${100 + i}`,
    title: `TITLE ${i}`,
    discipline,
    pageNumber: i + 1,
  })),
});

const metrics: RowMetrics = { columns: 3, cardHeight: 100, headingHeight: 20, gap: 10 };

describe("layoutRows", () => {
  it("puts a heading before each section and fills rows up to the column count", () => {
    const { rows } = layoutRows([group("A", 7), group("S", 2)], metrics);
    expect(rows.map((r) => (r.kind === "heading" ? "h" : r.sheets.length))).toEqual([
      "h", 3, 3, 1, "h", 2,
    ]);
  });

  it("accumulates offsets across uneven rows, with the gap between each", () => {
    const { rows, height } = layoutRows([group("A", 4), group("S", 1)], metrics);
    // heading 0–20, cards 30–130, cards 140–240, heading 250–270, cards 280–380
    expect(rows.map((r) => r.top)).toEqual([0, 30, 140, 250, 280]);
    expect(height).toBe(380);
  });

  it("keeps every sheet exactly once, in order", () => {
    const groups = [group("A", 10), group("M", 5)];
    const { rows } = layoutRows(groups, { ...metrics, columns: 4 });
    const placed = rows.flatMap((r) => (r.kind === "cards" ? r.sheets : []));
    expect(placed).toEqual(groups.flatMap((g) => g.sheets));
  });

  it("treats a column count below one as one, so nothing divides by zero", () => {
    const { rows } = layoutRows([group("A", 2)], { ...metrics, columns: 0 });
    expect(rows.filter((r) => r.kind === "cards")).toHaveLength(2);
  });

  it("lays out an empty set as no rows and no height", () => {
    expect(layoutRows([], metrics)).toEqual({ rows: [], height: 0 });
  });
});

describe("visibleRows", () => {
  // Offsets: 0, 30, 140, 250, 360, 470 … one heading then cards of 100 + 10 gap.
  const { rows } = layoutRows([group("A", 30)], metrics);

  it("returns the rows intersecting the viewport", () => {
    expect(visibleRows(rows, 0, 100, 0)).toEqual({ start: 0, end: 2 });
    // 150–250: the row at 140 is in; the row at 250 starts exactly at the edge, so out.
    expect(visibleRows(rows, 150, 100, 0)).toEqual({ start: 2, end: 3 });
  });

  it("does not count a row that ends exactly at the viewport's top", () => {
    // Row 1 spans 30–130; a viewport starting at 130 no longer shows it.
    expect(visibleRows(rows, 130, 50, 0).start).toBe(2);
  });

  it("widens the range by the overscan on both sides", () => {
    // 360–460 alone is row 4; 240–580 adds the row on each side.
    expect(visibleRows(rows, 360, 100, 0)).toEqual({ start: 4, end: 5 });
    expect(visibleRows(rows, 360, 100, 120)).toEqual({ start: 3, end: 6 });
  });

  it("clamps at both ends of the list", () => {
    const last = rows.length;
    expect(visibleRows(rows, -500, 100, 0)).toEqual({ start: 0, end: 0 });
    expect(visibleRows(rows, 1_000_000, 100, 0)).toEqual({ start: last, end: last });
  });
});

describe("sectionAt", () => {
  const { rows } = layoutRows([group("A", 3), group("S", 3)], metrics);
  // A heading 0, A cards 30–130, S heading 140–160, S cards 170–270

  it("names the section whose content is at the offset", () => {
    expect(sectionAt(rows, 0)).toBe(0);
    expect(sectionAt(rows, 129)).toBe(0);
    expect(sectionAt(rows, 140)).toBe(1);
    expect(sectionAt(rows, 1_000)).toBe(1);
  });

  it("gives a gap to the row above it", () => {
    expect(sectionAt(rows, 135)).toBe(0);
  });

  it("falls back to the first section for an empty layout or a negative offset", () => {
    expect(sectionAt([], 50)).toBe(0);
    expect(sectionAt(rows, -10)).toBe(0);
  });
});

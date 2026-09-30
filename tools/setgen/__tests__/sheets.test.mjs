import { describe, expect, it } from "vitest";

import { DISCIPLINES, buildSheetList } from "../sheets.mjs";

describe("discipline table", () => {
  it("weights sum to 100, so a weight reads as a percentage of the set", () => {
    const total = DISCIPLINES.reduce((sum, d) => sum + d.weight, 0);
    expect(total).toBe(100);
  });

  it("gives every discipline enough series for a 2,000 sheet set", () => {
    // A series holds 99 sheets. This is the check that catches a weight being
    // raised without the series list growing to match it.
    for (const discipline of DISCIPLINES) {
      const share = Math.ceil(2000 * (discipline.weight / 100));
      expect(discipline.series.length * 99).toBeGreaterThanOrEqual(share);
    }
  });
});

describe("buildSheetList", () => {
  it("produces exactly the requested number of sheets", () => {
    expect(buildSheetList(1).length).toBe(1);
    expect(buildSheetList(24).length).toBe(24);
    expect(buildSheetList(1500).length).toBe(1500);
  });

  it("never issues the same sheet number twice", () => {
    const sheets = buildSheetList(1500);
    const ids = new Set(sheets.map((s) => s.sheetId));
    expect(ids.size).toBe(sheets.length);
  });

  it("is prefix-stable: a smaller count is a prefix of a larger one", () => {
    // The property the whole generator rests on. A spot check at 24 sheets and a
    // perf run at 1,500 have to be describing the same A-101, or a number taken
    // against one set cannot be compared with a number taken against the other.
    const small = buildSheetList(24);
    const large = buildSheetList(1500);
    expect(large.slice(0, 24)).toEqual(small);
  });

  it("is a pure function of count", () => {
    expect(buildSheetList(120)).toEqual(buildSheetList(120));
  });

  it("numbers sheets inside their declared series block", () => {
    for (const sheet of buildSheetList(1500)) {
      const number = Number(sheet.sheetId.split("-")[1]);
      expect(number).toBeGreaterThan(sheet.series);
      expect(number).toBeLessThanOrEqual(sheet.series + 99);
    }
  });

  it("holds the architectural family at roughly half the set", () => {
    const sheets = buildSheetList(1000);
    const architectural = sheets.filter((s) =>
      s.discipline.startsWith("A"),
    ).length;
    expect(architectural).toBeGreaterThanOrEqual(495);
    expect(architectural).toBeLessThanOrEqual(505);
  });

  it("rejects a count that is not a positive integer", () => {
    expect(() => buildSheetList(0)).toThrow();
    expect(() => buildSheetList(-5)).toThrow();
    expect(() => buildSheetList(2.5)).toThrow();
  });
});

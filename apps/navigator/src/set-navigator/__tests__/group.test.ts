import { describe, expect, it } from "vitest";

import { groupByDiscipline } from "../group";

const sheet = (sheetId: string, discipline: string, pageNumber: number) => ({
  sheetId,
  title: `TITLE ${sheetId}`,
  discipline,
  pageNumber,
});

describe("groupByDiscipline", () => {
  it("keeps the index's order of disciplines and of sheets within each", () => {
    const groups = groupByDiscipline([
      sheet("A-101", "A", 1),
      sheet("S-201", "S", 2),
      sheet("A-102", "A", 3),
    ]);
    expect(groups.map((g) => g.discipline)).toEqual(["A", "S"]);
    expect(groups[0]!.sheets.map((s) => s.sheetId)).toEqual(["A-101", "A-102"]);
  });

  it("names known disciplines", () => {
    const [group] = groupByDiscipline([sheet("AI-140", "AI", 1)]);
    expect(group!.name).toBe("Interiors");
  });

  it("keeps sheets of an unknown discipline, labelled by code", () => {
    const [group] = groupByDiscipline([sheet("P-101", "P", 1)]);
    expect(group!.name).toBe("P");
    expect(group!.sheets).toHaveLength(1);
  });
});

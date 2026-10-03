import type { SheetIndexEntry } from "../sources";
import type { DisciplineGroup } from "./types";

const DISCIPLINE_NAMES: Record<string, string> = {
  A: "Architectural",
  AD: "Architectural Details",
  AI: "Interiors",
  C: "Civil",
  E: "Electrical",
  M: "Mechanical",
  S: "Structural",
};

/* Sections follow the index's own order, so the list reads the way the set
   was issued. A discipline code with no known name is shown as its code rather
   than dropped: a sheet missing from the navigator is a sheet nobody can open. */
export function groupByDiscipline(sheets: SheetIndexEntry[]): DisciplineGroup[] {
  const groups = new Map<string, DisciplineGroup>();
  for (const sheet of sheets) {
    let group = groups.get(sheet.discipline);
    if (!group) {
      group = {
        discipline: sheet.discipline,
        name: DISCIPLINE_NAMES[sheet.discipline] ?? sheet.discipline,
        sheets: [],
      };
      groups.set(sheet.discipline, group);
    }
    group.sheets.push(sheet);
  }
  return [...groups.values()];
}

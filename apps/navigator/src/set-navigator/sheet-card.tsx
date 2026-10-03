import type { SheetIndexEntry } from "../sources";
import type { DisciplineGroup } from "./types";

/* The thumbnail box is drawn at its final size, empty, so the card measured
   now is the card a thumbnail will later fill. */
export function SheetCard({ sheet }: { sheet: SheetIndexEntry }) {
  return (
    <article className="sheet-card">
      <div className="sheet-card-thumb" aria-hidden="true" />
      <div className="sheet-card-body">
        <span className="sheet-card-number">{sheet.sheetId}</span>
        <span className="sheet-card-title">{sheet.title}</span>
      </div>
    </article>
  );
}

/* The heading's content only; each grid places the heading element itself. */
export function SectionLabel({ group }: { group: DisciplineGroup }) {
  return (
    <>
      <span className="sheet-grid-section-name">
        {group.discipline} · {group.name}
      </span>
      <span className="sheet-grid-section-count">{group.sheets.length} sheets</span>
    </>
  );
}

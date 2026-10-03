import { useEffect } from "react";

import { markGridShown } from "./grid-shown";
import { SectionLabel, SheetCard } from "./sheet-card";
import type { DisciplineGroup } from "./types";

/* Every sheet in the set as a DOM card, all at once. The baseline the virtual
   grid is measured against, reachable at `?grid=full`. */
export function FullGrid({ groups, count }: { groups: DisciplineGroup[]; count: number }) {
  useEffect(markGridShown, []);

  return (
    <div className="sheet-grid sheet-grid-full" data-sheet-count={count}>
      {groups.map((group) => (
        <section key={group.discipline} className="sheet-grid-section">
          <h3 className="sheet-grid-section-heading">
            <SectionLabel group={group} />
          </h3>
          {group.sheets.map((sheet) => (
            <SheetCard key={sheet.sheetId} sheet={sheet} />
          ))}
        </section>
      ))}
    </div>
  );
}

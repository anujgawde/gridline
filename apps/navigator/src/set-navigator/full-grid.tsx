import { useEffect, useLayoutEffect, useRef } from "react";

import { markGridShown } from "./grid-shown";
import { SectionLabel, SheetCard } from "./sheet-card";
import type { DisciplineGroup } from "./types";

/* Every sheet in the set as a DOM card, all at once. The baseline the virtual
   grid is measured against, reachable at `?grid=full`. */
/* No thumbnails: this grid is the baseline as it was measured, and it renders
   no thumbnail provider, so its cards keep their empty boxes. */
export function FullGrid({ groups, count }: { groups: DisciplineGroup[]; count: number; baseUrl: string }) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(markGridShown, []);

  /* Back to the top on a filter change, as the virtual grid does. */
  useLayoutEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
  }, [groups]);

  return (
    <div ref={scrollerRef} className="sheet-grid sheet-grid-full" data-sheet-count={count}>
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

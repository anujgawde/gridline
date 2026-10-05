import { useRef } from "react";

import type { SheetIndexEntry } from "../sources";
import { openSheet } from "./open-sheet";
import { RevisionBadgeButton } from "./revision-badge-button";
import type { DisciplineGroup } from "./types";
import { useThumbnail } from "./use-thumbnail";

/* The thumbnail box is drawn at its final size whether or not an image fills
   it, so a card's height never changes when its thumbnail arrives.

   `thumbnail={false}` leaves the box empty even inside a grid that draws
   thumbnails; the virtual grid's measuring probe uses it, so measuring a card
   never fetches an image.

   The whole card opens its sheet, but the card is not itself a button: a
   reissued card holds a second control, the badge, and a button cannot
   contain another. So the sheet number is the button, and its ::after
   stretches over the card — clicking anywhere opens the sheet, while the badge
   sits above that layer and opens the comparison instead. */
export function SheetCard({
  sheet,
  thumbnail = true,
  tabIndex,
}: {
  sheet: SheetIndexEntry;
  thumbnail?: boolean;
  tabIndex?: number;
}) {
  const box = useRef<HTMLSpanElement>(null);
  const image = useThumbnail(sheet.sheetId, sheet.revision, box);
  const revised = sheet.revision > 1;

  return (
    <div className="sheet-card">
      <span
        ref={thumbnail ? box : undefined}
        className="sheet-card-thumb"
        aria-hidden="true"
        data-thumb={image.status}
      >
        {image.status === "loaded" && (
          <img className="sheet-card-image" src={image.url} alt="" decoding="async" draggable={false} />
        )}
      </span>
      <span className="sheet-card-body">
        <button
          type="button"
          className="sheet-card-open sheet-card-number"
          data-sheet-id={sheet.sheetId}
          tabIndex={tabIndex}
          aria-label={`${sheet.sheetId} ${sheet.title}`}
          onClick={() => openSheet(sheet.sheetId)}
        >
          {sheet.sheetId}
        </button>
        {revised && <RevisionBadgeButton sheet={sheet} />}
        <span className="sheet-card-title">{sheet.title}</span>
      </span>
    </div>
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

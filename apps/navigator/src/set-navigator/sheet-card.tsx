import { useRef } from "react";

import type { SheetIndexEntry } from "../sources";
import { openSheet } from "./open-sheet";
import type { DisciplineGroup } from "./types";
import { useThumbnail } from "./use-thumbnail";

/* The thumbnail box is drawn at its final size whether or not an image fills
   it, so a card's height never changes when its thumbnail arrives.

   `thumbnail={false}` leaves the box empty even inside a grid that draws
   thumbnails; the virtual grid's measuring probe uses it, so measuring a card
   never fetches an image.

   The whole card is the button that opens its sheet, so the target is the card
   rather than a control inside it. */
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
  const image = useThumbnail(sheet.sheetId, box);

  return (
    <button
      type="button"
      className="sheet-card"
      data-sheet-id={sheet.sheetId}
      tabIndex={tabIndex}
      onClick={() => openSheet(sheet.sheetId)}
    >
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
        <span className="sheet-card-number">{sheet.sheetId}</span>
        <span className="sheet-card-title">{sheet.title}</span>
      </span>
    </button>
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

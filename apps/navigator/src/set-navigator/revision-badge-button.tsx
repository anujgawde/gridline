import { RevisionBadge } from "@gridline/platform/ui";

import type { SheetIndexEntry } from "../sources";
import { requestCompare } from "./request-compare";

/* On a reissued sheet: the revision it opens at, and the way to see what
   changed since the first issue. The badge inside is decoration; the button
   carries the name, so a screen reader hears what pressing it does rather
   than a status.

   Status "current", not "superseded": the drawing a click opens is the latest
   revision, so nothing shown here is out of date. */
export function RevisionBadgeButton({ sheet }: { sheet: SheetIndexEntry }) {
  return (
    <button
      type="button"
      className="revision-badge-button"
      aria-label={`Compare REV 1 with REV ${sheet.revision}`}
      title={`REV ${sheet.revision} · compare with REV 1`}
      onClick={() => requestCompare(sheet)}
    >
      <RevisionBadge rev={sheet.revision} small aria-hidden="true" />
    </button>
  );
}

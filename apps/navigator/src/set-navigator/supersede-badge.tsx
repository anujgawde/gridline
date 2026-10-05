import { RevisionBadge } from "@gridline/platform/ui";

import type { SheetIndexEntry } from "../sources";
import { requestCompare } from "./request-compare";

/* Marks a sheet a later revision has replaced, and opens the comparison
   between them. The badge inside is decoration; the button carries the name,
   so a screen reader hears what pressing it does rather than a status. */
export function SupersedeBadge({ sheet }: { sheet: SheetIndexEntry }) {
  return (
    <button
      type="button"
      className="supersede-badge"
      aria-label={`Compare REV 1 with REV ${sheet.revision}`}
      title={`Superseded by REV ${sheet.revision} · compare`}
      onClick={() => requestCompare(sheet)}
    >
      <RevisionBadge rev={1} status="superseded" small showLabel={false} aria-hidden="true" />
    </button>
  );
}

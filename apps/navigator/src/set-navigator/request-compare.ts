import { bus } from "@gridline/platform/bus";

import type { SheetIndexEntry } from "../sources";

/* Asks for a comparison over the bus. The navigator does not know who shows
   it — the shell opens compare for any `compare:request`, from here or from
   anywhere else that publishes one.

   From revision 1 to the latest: what has changed since the sheet was first
   issued, ending at the revision a click on the card opens. */
export function requestCompare(sheet: SheetIndexEntry) {
  bus.publish("compare:request", {
    sheetId: sheet.sheetId,
    from: 1,
    to: sheet.revision,
  });
}

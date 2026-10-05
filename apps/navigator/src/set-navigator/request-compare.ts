import { bus } from "@gridline/platform/bus";

import type { SheetIndexEntry } from "../sources";

/* Asks for a comparison over the bus. The navigator does not know who shows
   it — the shell opens compare for any `compare:request`, from here or from
   anywhere else that publishes one.

   From revision 1 because that is what the set opens: the sheet as first
   issued, which a later revision has superseded. */
export function requestCompare(sheet: SheetIndexEntry) {
  bus.publish("compare:request", {
    sheetId: sheet.sheetId,
    from: 1,
    to: sheet.revision,
  });
}

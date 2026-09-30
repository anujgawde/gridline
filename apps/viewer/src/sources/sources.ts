import { z } from "zod";

import type { SheetSource } from "./types";

/* Validated on read, like every other document arriving over the network. */
const SourceLookup = z.object({
  sheets: z.object({ baseUrl: z.string().url() }),
});

/* Where the sheets are served from is deployment data, so it lives in a file on
   the serving origin rather than in this bundle — the same rule that keeps remote
   addresses out of the shell's build. The set can move to a different host
   without any app being rebuilt.

   The path is relative on purpose. Fetched from a page, it resolves against
   whichever origin is serving that page: the shell when this remote is federated
   into it, the viewer's own origin when it runs standalone. Neither copy is
   compiled in. */
export async function loadSheetSource(
  url = "/sources.json",
): Promise<SheetSource | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} responded ${response.status}`);
    return SourceLookup.parse(await response.json()).sheets;
  } catch (error) {
    console.error(`[viewer] sheet source lookup failed`, error);
    return null;
  }
}

export function sheetUrl(source: SheetSource, sheetId: string) {
  return `${source.baseUrl.replace(/\/$/, "")}/sheets/${sheetId}.pdf`;
}

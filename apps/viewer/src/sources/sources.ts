import { z } from "zod";

import type { SheetIndexEntry, SheetSource } from "./types";

/* Validated on read, like every document arriving over the network. */
const SourceLookup = z.object({
  sheets: z.object({ baseUrl: z.string().url() }),
});

const SheetIndex = z.object({
  sheets: z
    .object({
      sheetId: z.string().min(1),
      title: z.string(),
      discipline: z.string(),
      pageNumber: z.number().int().positive(),
    })
    .array()
    .min(1),
});

/* Where the sheets are served from is deployment data, so it lives in a file on
   the serving origin rather than in this bundle — the same rule that keeps remote
   addresses out of the shell's build. The set can move hosts without any app
   being rebuilt.

   The path is relative on purpose. Fetched from a page it resolves against
   whichever origin serves that page: the shell when this remote is federated,
   the viewer's own origin when it runs standalone. */
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

export async function loadSheetIndex(
  source: SheetSource,
): Promise<SheetIndexEntry[] | null> {
  const url = `${base(source)}/sheet-index.json`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} responded ${response.status}`);
    return SheetIndex.parse(await response.json()).sheets;
  } catch (error) {
    console.error(`[viewer] sheet index unavailable`, error);
    return null;
  }
}

function base(source: SheetSource) {
  return source.baseUrl.replace(/\/$/, "");
}

/* The set as it is issued: every sheet in one document. What the naive renderer
   opens, because that is what someone is actually handed. */
export function combinedUrl(source: SheetSource) {
  return `${base(source)}/combined.pdf`;
}

/* One sheet on its own — a derived artifact, not how a set arrives. The tiler
   consumes these; no renderer fetches them. */
export function sheetUrl(source: SheetSource, sheetId: string) {
  return `${base(source)}/sheets/${sheetId}.pdf`;
}

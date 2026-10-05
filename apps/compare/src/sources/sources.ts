import { SheetIndex, SourceLookup } from "./schema";
import type { SheetSource } from "./schema";

/* Relative on purpose: federated, it resolves against the shell's origin and
   the shell's copy answers; standalone, this app's own copy does. The set's
   address is deployment data, never compiled into a bundle. */
export async function loadSheetSource(
  url = "/sources.json",
): Promise<SheetSource> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  return SourceLookup.parse(await response.json()).sheets;
}

/* A sheet's latest revision. The index is served immutable and the navigator
   has usually read it already, so this is normally answered from the browser's
   cache. */
export async function loadLatestRevision(
  source: SheetSource,
  sheetId: string,
): Promise<number | null> {
  const url = `${source.baseUrl.replace(/\/$/, "")}/sheet-index.json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  const { sheets } = SheetIndex.parse(await response.json());
  return sheets.find((s) => s.sheetId === sheetId)?.revision ?? null;
}

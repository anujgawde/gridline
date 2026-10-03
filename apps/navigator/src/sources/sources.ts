import { SheetIndex, SourceLookup } from "./schema";
import type { SheetIndexEntry, SheetSource } from "./schema";

/* Relative on purpose: federated, it resolves against the shell's origin and
   the shell's copy answers; standalone, this app's own copy does. The set's
   address is deployment data, never compiled into a bundle. */
export async function loadSheetSource(
  url = "/sources.json",
): Promise<SheetSource | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} responded ${response.status}`);
    return SourceLookup.parse(await response.json()).sheets;
  } catch (error) {
    console.error("[navigator] sheet source lookup failed", error);
    return null;
  }
}

export async function loadSheetIndex(
  source: SheetSource,
): Promise<SheetIndexEntry[] | null> {
  const url = `${source.baseUrl.replace(/\/$/, "")}/sheet-index.json`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} responded ${response.status}`);
    return SheetIndex.parse(await response.json()).sheets;
  } catch (error) {
    console.error("[navigator] sheet index unavailable", error);
    return null;
  }
}

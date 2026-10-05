import { SourceLookup } from "./schema";
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

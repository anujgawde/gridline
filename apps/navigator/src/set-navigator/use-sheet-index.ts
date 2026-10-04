import { useEffect, useState } from "react";

import { loadSheetIndex, loadSheetSource } from "../sources";
import type { SheetIndexEntry } from "../sources";
import { markIndexLoaded } from "./grid-shown";

export type SheetIndexLoad =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "ready"; sheets: SheetIndexEntry[]; baseUrl: string };

/* The set's sheet index, fetched once per mount. Shared by both layouts, so
   the grid and the panel always list the same sheets. */
export function useSheetIndex(): SheetIndexLoad {
  const [load, setLoad] = useState<SheetIndexLoad>({ state: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const source = await loadSheetSource();
      const sheets = source ? await loadSheetIndex(source) : null;
      if (sheets) markIndexLoaded();
      if (!cancelled) {
        setLoad(
          source && sheets
            ? { state: "ready", sheets, baseUrl: source.baseUrl }
            : { state: "failed" },
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return load;
}

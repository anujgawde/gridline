import { useEffect, useState } from "react";

import { loadTileIndex } from "../pyramid";
import type { PyramidRef } from "../pyramid";
import { loadSheetSource } from "../sources";

import type { PyramidsState } from "./types";

/* Both revisions' tile indexes, or nothing: a comparison with one side missing
   is not a comparison. */
export function usePyramids(sheetId: string, from: number, to: number) {
  const [state, setState] = useState<PyramidsState>({ status: "loading" });

  useEffect(() => {
    let live = true;
    setState({ status: "loading" });

    (async (): Promise<PyramidsState> => {
      const { baseUrl } = await loadSheetSource();
      const ref = (revision: number): PyramidRef => ({ baseUrl, sheetId, revision });
      const fromRef = ref(from);
      const toRef = ref(to);
      const [fromIndex, toIndex] = await Promise.all([
        loadTileIndex(fromRef),
        loadTileIndex(toRef),
      ]);
      return {
        status: "ready",
        from: { ref: fromRef, index: fromIndex },
        to: { ref: toRef, index: toIndex },
      };
    })().then(
      (next) => live && setState(next),
      (error: unknown) => {
        console.error(`[compare] ${sheetId} REV ${from} → ${to} unavailable`, error);
        if (live) setState({ status: "failed" });
      },
    );

    return () => {
      live = false;
    };
  }, [sheetId, from, to]);

  return state;
}

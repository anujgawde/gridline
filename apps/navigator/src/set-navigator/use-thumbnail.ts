import { createContext, useContext, useEffect, useState } from "react";
import type { RefObject } from "react";

import type { ThumbnailServices, ThumbnailState } from "./types";

/* Provided by a grid that draws thumbnails. Absent, a card draws its empty box,
   which is how the full grid stays the baseline it was measured as. */
export const ThumbnailContext = createContext<ThumbnailServices | null>(null);

/* A card's thumbnail: requested when the card comes on screen, withdrawn if it
   leaves before arriving, and kept once loaded for as long as the card exists. */
export function useThumbnail(sheetId: string, ref: RefObject<Element | null>): ThumbnailState {
  const thumbnails = useContext(ThumbnailContext);
  const [state, setState] = useState<ThumbnailState>({ status: "idle" });

  useEffect(() => {
    const element = ref.current;
    if (!thumbnails || !element) return;

    let withdraw: (() => void) | null = null;
    let url: string | null = null;

    const stopWatching = thumbnails.watcher.watch(element, (visible) => {
      if (url) return;
      if (visible && !withdraw) {
        setState({ status: "loading" });
        withdraw = thumbnails.loader.request(
          sheetId,
          (loaded) => {
            url = loaded;
            withdraw = null;
            setState({ status: "loaded", url: loaded });
          },
          () => {
            withdraw = null;
            setState({ status: "failed" });
          },
        );
      } else if (!visible && withdraw) {
        withdraw();
        withdraw = null;
        setState({ status: "idle" });
      }
    });

    return () => {
      stopWatching();
      withdraw?.();
      if (url) URL.revokeObjectURL(url);
    };
  }, [thumbnails, sheetId, ref]);

  return state;
}

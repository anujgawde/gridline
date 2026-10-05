import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SetStateAction } from "react";

import { fit, zoomAtCentre } from "../view";
import type { Size, View } from "../view";

import { movePane, relock } from "./pane-views";
import type { PaneViews, PyramidsState, Side } from "./types";

const UNFITTED: PaneViews = { from: null, to: null };

/* Each pane's view, and whether they move together. Fitted to the page once
   the page size and a pane size are both known, and again whenever the
   comparison changes. */
export function usePaneViews(state: PyramidsState, key: string, locked: boolean) {
  const [views, setViews] = useState<PaneViews>(UNFITTED);
  const [paneSize, setPaneSize] = useState<Size | null>(null);
  const lastMoved = useRef<Side>("to");

  useEffect(() => setViews(UNFITTED), [key]);

  useEffect(() => {
    if (views.from || state.status !== "ready" || !paneSize) return;
    const { pageWidth, pageHeight } = state.to.index;
    const fitted = fit({ width: pageWidth, height: pageHeight }, paneSize);
    setViews({ from: fitted, to: fitted });
  }, [views.from, state, paneSize]);

  useEffect(() => {
    if (locked) setViews((v) => relock(v, lastMoved.current));
  }, [locked]);

  /* A setter per pane, shaped like a state setter so a pane cannot tell
     whether it is moving alone or with the other. */
  const setters = useMemo(() => {
    const setterFor = (side: Side) => (update: SetStateAction<View | null>) => {
      lastMoved.current = side;
      setViews((v) => {
        const next = typeof update === "function" ? update(v[side]) : update;
        return movePane(v, side, next, locked);
      });
    };
    return { from: setterFor("from"), to: setterFor("to") };
  }, [locked]);

  /* The zoom buttons: each pane about its own middle, so locked panes stay
     identical and unlocked ones each keep what they are centred on. */
  const zoomBoth = useCallback(
    (factor: number) => {
      if (!paneSize) return;
      const zoom = (v: View | null) => v && zoomAtCentre(v, factor, paneSize);
      setViews((v) => ({ from: zoom(v.from), to: zoom(v.to) }));
    },
    [paneSize],
  );

  /* Unfitted views are fitted again by the effect above. */
  const fitBoth = useCallback(() => setViews(UNFITTED), []);

  return { views, setters, setPaneSize, zoomBoth, fitBoth };
}

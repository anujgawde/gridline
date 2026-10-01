import { useCallback, useEffect, useMemo, useState } from "react";
import type { RefObject } from "react";

import { useGestures, ZOOM_STEP } from "../gestures";
import type { GestureView } from "../gestures";
import type { Viewport, ViewControls } from "./types";

/* Pan and zoom for the naive renderer.

   The gesture layer is shared with the tiled renderer, deliberately. If the two
   renderers handled input differently, the measured difference between them
   would include the difference between two input implementations — and the
   claim is about rendering. Same gestures, same momentum, same limits; only
   what happens to the pixels differs.

   What this renderer still does naively is the drawing: the page is rasterized
   once at one resolution and then moved and scaled as a bitmap, so zooming in
   goes soft. That is the honest trade, and one of the things tiling fixes. */

const MIN_SCALE = 0.05;
const MAX_SCALE = 8;
const INITIAL: Viewport = { x: 0, y: 0, scale: 0.25 };

export function usePanZoom(
  resetKey: string,
  surfaceRef: RefObject<HTMLElement | null>,
): { viewport: Viewport; controls: ViewControls } {
  const [viewport, setViewport] = useState<Viewport>(INITIAL);

  const onChange = useCallback((next: GestureView) => setViewport(next), []);

  const gestures = useGestures(surfaceRef, {
    initial: INITIAL,
    onChange,
    minScale: MIN_SCALE,
    maxScale: MAX_SCALE,
  });

  // A new sheet starts framed rather than wherever the last one was left.
  useEffect(() => {
    gestures.setView(INITIAL);
  }, [resetKey, gestures]);

  const controls = useMemo<ViewControls>(
    () => ({
      zoomIn: () => gestures.zoomBy(ZOOM_STEP),
      zoomOut: () => gestures.zoomBy(1 / ZOOM_STEP),
      fit: () => gestures.setView(INITIAL),
    }),
    [gestures],
  );

  return { viewport, controls };
}

import { useCallback, useEffect, useRef, useState } from "react";

import type { Viewport } from "./types";

/* Pan and zoom for the naive renderer, over Pointer Events.

   Deliberately the simple version: the page is already rasterized at one
   resolution, so moving and scaling it is a CSS transform on that bitmap. No
   re-rasterization at the new scale, which is why zooming in goes soft — the
   honest trade the naive approach makes, and one of the things tiling fixes.

   The hand-rolled gesture layer with momentum and pinch is step 1.5. This is
   only enough to make panning and zooming measurable, because frame times
   during interaction cannot be recorded against a renderer that does not move. */

const MIN_SCALE = 0.05;
const MAX_SCALE = 8;
const INITIAL: Viewport = { x: 0, y: 0, scale: 0.25 };

export function usePanZoom(resetKey: string) {
  const [viewport, setViewport] = useState<Viewport>(INITIAL);
  const dragging = useRef<{ x: number; y: number } | null>(null);

  // A new sheet starts framed rather than wherever the last one was left.
  useEffect(() => setViewport(INITIAL), [resetKey]);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    (event.target as Element).setPointerCapture?.(event.pointerId);
    dragging.current = { x: event.clientX, y: event.clientY };
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    const from = dragging.current;
    if (!from) return;
    const dx = event.clientX - from.x;
    const dy = event.clientY - from.y;
    dragging.current = { x: event.clientX, y: event.clientY };
    setViewport((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = null;
  }, []);

  const onWheel = useCallback((event: React.WheelEvent) => {
    const factor = Math.exp(-event.deltaY / 500);
    setViewport((v) => ({
      ...v,
      scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor)),
    }));
  }, []);

  return {
    viewport,
    bind: { onPointerDown, onPointerMove, onPointerUp, onWheel },
  };
}

import { useEffect, useRef, useState } from "react";

import type { ViewFrame } from "../../renderers";
import type { MarkupStore } from "../store";
import { paintMarkups, visibleBox } from "./paint";
import type { MarkupLayerProps, PaintStyle } from "./types";

/* Read per paint rather than cached: a theme switch is an attribute change
   somewhere above this element, and nothing tells the overlay it happened. One
   computed-style read a frame is the price of always matching. */
function readStyle(element: HTMLElement): PaintStyle {
  const css = getComputedStyle(element);
  return {
    colour: css.getPropertyValue("--markup-default").trim(),
    minStrokePx: parseFloat(css.getPropertyValue("--border-w-emphasis")) || 2,
    fontFamily: css.getPropertyValue("--font-ui").trim(),
  };
}

function paint(canvas: HTMLCanvasElement, frame: ViewFrame, store: MarkupStore): void {
  if (canvas.width !== frame.width) canvas.width = frame.width;
  if (canvas.height !== frame.height) canvas.height = frame.height;
  const context = canvas.getContext("2d");
  if (!context) return;
  /* Only what is on screen. The index answers this in a handful of node
     visits, so a sheet carrying thousands of markups draws the few in view. */
  paintMarkups(context, frame, store.inBox(visibleBox(frame)), readStyle(canvas));
}

/* The sheet's markups, drawn over the tiles.

   It paints from inside the renderer's frame, through the view source, so it
   moves with the sheet rather than a frame behind it, and again whenever the
   store changes. Input reaches it through the renderer's host rather than this
   canvas, which takes no pointer events: the gesture layer captures pointers
   on the host, so events would never arrive here anyway. */
export function MarkupLayer({ source, stores }: MarkupLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [store, setStore] = useState<MarkupStore | null>(null);
  const storeRef = useRef<MarkupStore | null>(null);

  useEffect(() => {
    if (!source) return;
    const onFrame = (frame: ViewFrame) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const next = stores.get(frame.sheetId, frame.revision, {
        x: 0,
        y: 0,
        w: frame.pageWidth,
        h: frame.pageHeight,
      });
      /* Through a ref first, so a frame that changes nothing does not queue a
         render. This runs once per frame during a pan. */
      if (next !== storeRef.current) {
        storeRef.current = next;
        setStore(next);
      }
      paint(canvas, frame, next);
    };
    const first = source.current();
    if (first) onFrame(first);
    return source.subscribe(onFrame);
  }, [source, stores]);

  useEffect(() => {
    if (!store || !source) return;
    return store.subscribe(() => {
      const canvas = canvasRef.current;
      const frame = source.current();
      /* A change to a store whose sheet has since been left is not drawn. */
      if (canvas && frame && storeRef.current === store) paint(canvas, frame, store);
    });
  }, [store, source]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 size-full"
      data-markups={store?.markups.length ?? 0}
    />
  );
}

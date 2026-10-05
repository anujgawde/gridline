import { useCallback, useEffect, useRef, useState } from "react";

import { useViewInput } from "../view";
import type { Size } from "../view";

import { drawPane } from "./draw";
import { TileSet } from "./tile-set";
import type { PaneProps } from "./types";
import "./pane.css";

/* One revision on a canvas. Draws from the shared view and writes to it, but
   holds no view of its own. */
export function Pane({ pyramid, label, view, setView, onResize }: PaneProps) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const tiles = useRef<TileSet | null>(null);
  const frame = useRef(0);
  const [size, setSize] = useState<Size | null>(null);

  /* Read by the frame callback, which a tile arrival can schedule at any
     time — it must draw what is current then, not what was current when it
     was scheduled. */
  const latest = useRef({ view, size });
  latest.current = { view, size };

  useViewInput(host, setView);

  const draw = useCallback(() => {
    const { view, size } = latest.current;
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx || !view || !size || !tiles.current) return;

    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(size.width * dpr);
    const height = Math.round(size.height * dpr);
    if (el.width !== width || el.height !== height) {
      el.width = width;
      el.height = height;
    }
    const kept = drawPane(ctx, tiles.current, pyramid.index, view, size, dpr);
    tiles.current.keepLevels(kept);
  }, [pyramid]);

  const schedule = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(draw);
  }, [draw]);

  useEffect(() => {
    const set = new TileSet(pyramid.ref, schedule);
    tiles.current = set;
    schedule();
    return () => {
      cancelAnimationFrame(frame.current);
      set.dispose();
      tiles.current = null;
    };
  }, [pyramid, schedule]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const next = {
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      };
      setSize(next);
      onResize?.(next);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onResize]);

  useEffect(schedule, [view, size, schedule]);

  return (
    <div className="compare-pane" ref={host}>
      <canvas className="compare-pane-canvas" ref={canvas} />
      <span className="compare-pane-label">{label}</span>
    </div>
  );
}

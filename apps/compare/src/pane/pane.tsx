import { useCallback, useEffect, useRef } from "react";

import { useViewInput } from "../view";

import { drawPane } from "./draw";
import { PaneHeader } from "./pane-header";
import { drawRegions, regionStyle } from "./regions";
import { TileSet } from "./tile-set";
import type { PaneProps, RegionStyle } from "./types";
import { useStage } from "./use-stage";
import "./pane.css";

/* One revision on a canvas. Draws from the shared view and writes to it, but
   holds no view of its own. */
export function Pane({ pyramid, heading, view, setView, onResize, regions, selectedId }: PaneProps) {
  const { host, size } = useStage(onResize);
  const canvas = useRef<HTMLCanvasElement>(null);
  const tiles = useRef<TileSet | null>(null);
  const frame = useRef(0);
  const style = useRef<RegionStyle | null>(null);

  /* Read by the frame callback, which a tile arrival can schedule at any
     time — it must draw what is current then, not what was current when it
     was scheduled. */
  const latest = useRef({ view, size, regions, selectedId });
  latest.current = { view, size, regions, selectedId };

  useViewInput(host, setView);

  const draw = useCallback(() => {
    const { view, size, regions, selectedId } = latest.current;
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
    if (style.current) drawRegions(ctx, regions, selectedId, view, dpr, style.current);
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
    if (host.current) style.current = regionStyle(host.current);
  }, [host]);

  useEffect(schedule, [view, size, regions, selectedId, schedule]);

  return (
    <div className="compare-pane">
      <PaneHeader heading={heading} revision={pyramid.ref.revision} view={view} />
      <div className="compare-pane-stage" ref={host}>
        <canvas className="compare-pane-canvas" ref={canvas} />
      </div>
    </div>
  );
}

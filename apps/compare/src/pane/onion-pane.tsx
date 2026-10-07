import { useCallback, useEffect, useRef } from "react";

import { coarsestLevel } from "../pyramid";
import { useViewInput } from "../view";

import { drawOnion } from "./onion";
import { drawRegions, regionStyle } from "./regions";
import { TileSet } from "./tile-set";
import type { OnionPaneProps, RegionStyle } from "./types";
import { useStage } from "./use-stage";
import "./pane.css";

/* A canvas cannot read `var()`, so the tints are taken from the tokens once. */
function tint(el: HTMLElement, name: string) {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

/* Both revisions on one canvas, each in its own colour, blended by the
   slider. Draws from the shared view and writes to it like a pane does. */
export function OnionPane({ from, to, opacity, view, setView, onResize, regions, selectedId, onShown }: OnionPaneProps) {
  const { host, size } = useStage(onResize);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scratch = useRef<{ from: HTMLCanvasElement; to: HTMLCanvasElement } | null>(null);
  const tiles = useRef<{ from: TileSet; to: TileSet } | null>(null);
  const colours = useRef<{ from: string; to: string } | null>(null);
  const frame = useRef(0);
  const style = useRef<RegionStyle | null>(null);
  const shown = useRef(false);

  const latest = useRef({ view, size, opacity, regions, selectedId, onShown });
  latest.current = { view, size, opacity, regions, selectedId, onShown };

  useViewInput(host, setView);

  const draw = useCallback(() => {
    const { view, size, opacity, regions, selectedId } = latest.current;
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    const sets = tiles.current;
    if (!el || !ctx || !view || !size || !sets || !scratch.current || !colours.current) return;

    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(size.width * dpr);
    const height = Math.round(size.height * dpr);
    if (el.width !== width || el.height !== height) {
      el.width = width;
      el.height = height;
    }
    const kept = drawOnion(
      ctx,
      { tiles: sets.from, index: from.index, colour: colours.current.from, opacity: opacity.from },
      { tiles: sets.to, index: to.index, colour: colours.current.to, opacity: opacity.to },
      scratch.current,
      to.index,
      view,
      size,
      dpr,
    );
    sets.from.keepLevels(kept.from);
    sets.to.keepLevels(kept.to);
    if (style.current) drawRegions(ctx, regions, selectedId, view, dpr, style.current);

    if (
      !shown.current &&
      sets.from.holds(coarsestLevel(from.index.levels)) &&
      sets.to.holds(coarsestLevel(to.index.levels))
    ) {
      shown.current = true;
      latest.current.onShown?.();
    }
  }, [from, to]);

  const schedule = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(draw);
  }, [draw]);

  useEffect(() => {
    if (host.current) {
      colours.current = {
        from: tint(host.current, "--compare-from"),
        to: tint(host.current, "--compare-to"),
      };
      style.current = regionStyle(host.current);
    }
    scratch.current = {
      from: document.createElement("canvas"),
      to: document.createElement("canvas"),
    };
  }, [host]);

  useEffect(() => {
    const sets = { from: new TileSet(from.ref, schedule), to: new TileSet(to.ref, schedule) };
    tiles.current = sets;
    shown.current = false;
    schedule();
    return () => {
      cancelAnimationFrame(frame.current);
      sets.from.dispose();
      sets.to.dispose();
      tiles.current = null;
    };
  }, [from, to, schedule]);

  useEffect(schedule, [view, size, opacity.from, opacity.to, regions, selectedId, schedule]);

  return (
    <div className="compare-pane">
      <div className="compare-pane-stage" ref={host}>
        <canvas className="compare-pane-canvas" ref={canvas} />
      </div>
    </div>
  );
}

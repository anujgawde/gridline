import { useEffect, useRef, useState } from "react";

import type { SheetSource } from "../../sources";
import { TileCache } from "./tile-cache";
import { DeepZoomRenderer, needsDeepZoom } from "./deep-zoom";
import type { DeepZoomResult } from "./deep-zoom";
import { tileId } from "./tile-cache";
import { loadTileIndex, TileLoader } from "./tile-loader";
import type { TileIndex } from "./types";
import { fitScale, levelFor, tileRect, visibleTiles } from "./viewport";
import type { ViewState } from "./viewport";

/* The tiled renderer.

   It never sees a PDF. The pyramid was rasterized once, offline, so the browser
   fetches images — which means no parser is shipped to the client, nothing is
   parsed on the main thread, and the bytes moved are bounded by the size of the
   viewport rather than the size of the document.

   Three things make it work:
     - the level closest to the current zoom is used, so no more pixels are
       decoded than the screen can show
     - decoding happens off the main thread, via createImageBitmap
     - the tile cache has a byte budget and evicts, so a long session does not
       grow the way the naive renderer does */

const TILE_SIZE = 512;

/* 256 MB of decoded tiles. A 512x512 tile costs 1 MB decoded, so this is about
   250 tiles — roughly twenty screenfuls. Chosen as a starting point rather than
   derived: the session measurement is what should set it. */
const CACHE_BUDGET_BYTES = 256 * 1024 * 1024;

const MIN_SCALE = 0.02;
const MAX_SCALE = 4;

interface Props {
  sheetId: string;
  source: SheetSource;
  onPainted?: (sheetId: string) => void;
}

export function TiledRenderer({ sheetId, source, onPainted }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const cacheRef = useRef<TileCache>(null);
  const loaderRef = useRef<TileLoader>(null);
  const indexRef = useRef<TileIndex | null>(null);
  const viewRef = useRef<ViewState>({ x: 0, y: 0, scale: 0.1 });
  const frameRef = useRef(0);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const deepRef = useRef<DeepZoomRenderer>(null);
  const deepResultRef = useRef<DeepZoomResult | null>(null);

  /* Which sheet is actually on the canvas, not merely which one was asked for.
     Reporting "painted" against a sheetId that has only just changed makes a
     measurement see the previous sheet's paint and record it as this one's —
     which showed up as a 21 ms sheet change in a run where nothing was that
     fast. */
  const [paintedSheet, setPaintedSheet] = useState<string | null>(null);
  const [failedSheet, setFailedSheet] = useState<string | null>(null);
  const [stats, setStats] = useState({ bytes: 0, count: 0, level: 0, scale: 0 });

  cacheRef.current ??= new TileCache(CACHE_BUDGET_BYTES);
  loaderRef.current ??= new TileLoader(
    source.baseUrl.replace(/\/$/, ""),
    cacheRef.current,
  );
  deepRef.current ??= new DeepZoomRenderer(
    source.baseUrl.replace(/\/$/, ""),
    (result) => {
      deepResultRef.current?.bitmap.close();
      deepResultRef.current = result;
      scheduleDraw();
    },
  );

  /* One draw per animation frame, never per event. A pointer can fire far more
     often than the display refreshes, and drawing per event queues work the
     screen will never show. */
  const scheduleDraw = () => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      draw();
    });
  };

  const draw = () => {
    const canvas = canvasRef.current;
    const index = indexRef.current;
    const loader = loaderRef.current;
    const cache = cacheRef.current;
    if (!canvas || !index || !loader || !cache) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const view = viewRef.current;
    const target = levelFor(index, view.scale);

    /* Cleared rather than filled: the surface behind the sheet is the app's,
       not the drawing's. */
    context.clearRect(0, 0, canvas.width, canvas.height);

    /* Draw coarse to sharp, every level that has something cached, each one
       painting over the last.

       This is what stops a zoom or a sheet change showing an empty canvas. The
       level-0 tile is one image and is never evicted, so there is always
       something to stretch; sharper levels land on top as they arrive and the
       picture resolves rather than appearing. Waiting for the exact level
       before drawing anything is what made this feel like a reload. */
    for (let l = 0; l <= target.level; l += 1) {
      const level = index.levels[l];
      if (!level) continue;

      const keys = visibleTiles(
        index,
        level,
        view,
        canvas.width,
        canvas.height,
        TILE_SIZE,
      );

      /* Only the sharpest level is requested. Fetching every intermediate level
         would multiply the bytes moved for pixels that are about to be painted
         over. */
      const available =
        l === target.level
          ? loader.request(index.sheetId, keys, scheduleDraw)
          : keys
              .map((key) => ({
                key,
                bitmap: cache.peek(tileId(index.sheetId, key)),
              }))
              .filter((t): t is { key: typeof keys[number]; bitmap: ImageBitmap } =>
                Boolean(t.bitmap),
              );

      for (const { key, bitmap } of available) {
        const rect = tileRect(index, level, key, view, TILE_SIZE);
        context.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height);
      }
    }

    /* Past the deepest pre-rendered level every tile on screen is an upscale.
       A sharp render of the visible region is asked for from the worker, and
       painted over the stretched tiles when it arrives — so the view is never
       blank while it is being made, only soft. */
    const deep = deepResultRef.current;
    if (deep && deep.sheetId === index.sheetId) {
      context.drawImage(
        deep.bitmap,
        view.x + deep.x * view.scale,
        view.y + deep.y * view.scale,
        deep.width * view.scale,
        deep.height * view.scale,
      );
    }

    if (needsDeepZoom(index, view.scale) && !deepRef.current?.busy) {
      const region = {
        x: Math.max(0, -view.x / view.scale),
        y: Math.max(0, -view.y / view.scale),
        width: Math.min(index.pageWidth, canvas.width / view.scale),
        height: Math.min(index.pageHeight, canvas.height / view.scale),
      };
      const already =
        deep &&
        deep.sheetId === index.sheetId &&
        Math.abs(deep.x - region.x) < 1 &&
        Math.abs(deep.y - region.y) < 1 &&
        Math.abs(deep.width - region.width) < 1;

      if (!already) {
        /* A deep-zoom failure must not take the draw loop with it. Without this
           an exception here stopped every subsequent frame, and the symptom was
           a zoom that appeared to hit a limit. */
        try {
          deepRef.current?.request({
            sheetId: index.sheetId,
            ...region,
            pixelWidth: Math.round(canvas.width),
          });
        } catch (error) {
          console.error("[viewer] deep zoom unavailable", error);
        }
      }
    } else if (!needsDeepZoom(index, view.scale) && deep) {
      /* Back within the pyramid's range: the tiles are sharp again and the
         deep render is just memory. */
      deep.bitmap.close();
      deepResultRef.current = null;
    }

    const cacheStats = cache.stats();
    setStats({
      bytes: cacheStats.bytes,
      count: cacheStats.count,
      level: target.level,
      scale: view.scale,
    });
  };

  useEffect(() => {
    let cancelled = false;

    async function open() {
      performance.mark("gridline:sheet-start");

      /* Whatever the previous sheet still had in flight is now wasted
         bandwidth on a link someone is waiting on. */
      loaderRef.current?.abortExcept(sheetId);
      deepResultRef.current?.bitmap.close();
      deepResultRef.current = null;

      /* Stops drawing until the new sheet's grid is known. Without this the
         draw loop keeps running against the previous sheet's index and the
         previous zoom, so it requests deep-zoom tiles for a sheet nobody has
         looked at yet — which then compete with the tiles being waited on. It
         cost nearly three seconds a sheet change. */
      indexRef.current = null;

      const index = await loadTileIndex(
        source.baseUrl.replace(/\/$/, ""),
        sheetId,
      );
      if (cancelled) return;

      if (!index) {
        setFailedSheet(sheetId);
        return;
      }

      indexRef.current = index;

      const canvas = canvasRef.current;
      const host = hostRef.current;
      if (!canvas || !host) return;

      canvas.width = host.clientWidth;
      canvas.height = host.clientHeight;

      const scale = fitScale(index, canvas.width, canvas.height);
      viewRef.current = {
        scale,
        x: (canvas.width - index.pageWidth * scale) / 2,
        y: (canvas.height - index.pageHeight * scale) / 2,
      };

      /* The coarse level first, and paint as soon as it lands.

         Level 0 is a single ~20 KB tile of the whole sheet. Showing it
         immediately and letting sharper tiles arrive over it is what turns a
         sheet change from "blank, wait, drawing" into "drawing, then sharper".
         Waiting for the target level before painting anything was correct by
         the numbers and wrong to use. */
      const base = index.levels[0];
      if (base) {
        const keys = visibleTiles(
          index,
          base,
          viewRef.current,
          canvas.width,
          canvas.height,
          TILE_SIZE,
        );
        await Promise.all(
          keys.map((key) => {
            const id = tileId(sheetId, key);
            if (cacheRef.current?.has(id)) return undefined;
            return fetch(
              `${source.baseUrl.replace(/\/$/, "")}/tiles/${sheetId}/l${key.level}/${key.col}_${key.row}.webp`,
            )
              .then((r) => (r.ok ? r.blob() : null))
              .then((b) => (b ? createImageBitmap(b) : null))
              .then((bitmap) => {
                if (bitmap) cacheRef.current?.set(id, bitmap);
              })
              .catch(() => undefined);
          }),
        );
      }
      if (cancelled) return;

      /* Draws what arrived and requests the sharper level, which lands over it
         as it comes in. Nothing here waits for that. */
      draw();
      performance.mark("gridline:sheet-painted");
      performance.measure(
        "gridline:sheet-shown",
        "gridline:sheet-start",
        "gridline:sheet-painted",
      );

      setPaintedSheet(sheetId);
      onPainted?.(sheetId);
    }

    void open();
    return () => {
      cancelled = true;
    };
  }, [sheetId, source, onPainted]);

  /* The cache outlives a sheet change on purpose — going back to a sheet you
     just left should not re-fetch it. It is released when the renderer goes
     away. */
  /* Wheel is attached by hand, not through React, because React registers it
     as a passive listener — preventDefault is ignored there, so the browser
     scrolls or zooms the page as well as the sheet. Two ticks in, the canvas is
     no longer under the pointer and the rest of the gesture goes somewhere
     else. It looked like the zoom hitting a limit. */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();

      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;

      const view = viewRef.current;
      const scale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, view.scale * Math.exp(-event.deltaY / 500)),
      );

      /* Zoom about the pointer: the sheet point under the cursor stays under
         the cursor. Zooming about the origin is the single most common way a
         viewer feels wrong. */
      const ratio = scale / view.scale;
      viewRef.current = {
        scale,
        x: px - (px - view.x) * ratio,
        y: py - (py - view.y) * ratio,
      };
      scheduleDraw();
    };

    host.addEventListener("wheel", onWheel, { passive: false });
    return () => host.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const cache = cacheRef.current;
    const deep = deepRef.current;
    return () => {
      cache?.clear();
      deepResultRef.current?.bitmap.close();
      deepResultRef.current = null;
      deep?.destroy();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className="viewer-render"
      data-renderer="tiled"
      data-state={
        paintedSheet === sheetId
          ? "painted"
          : failedSheet === sheetId
            ? "failed"
            : "loading"
      }
      data-sheet={sheetId}
      data-pixels-mb={Math.round((stats.bytes / 1024 / 1024) * 10) / 10}
      data-tiles-held={stats.count}
      data-level={stats.level}
      data-deep={deepResultRef.current ? "1" : "0"}
      data-scale={stats.scale.toFixed(3)}
      data-needs-deep={
        indexRef.current && needsDeepZoom(indexRef.current, stats.scale)
          ? "1"
          : "0"
      }
      onPointerDown={(event) => {
        (event.target as Element).setPointerCapture?.(event.pointerId);
        dragRef.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerMove={(event) => {
        const from = dragRef.current;
        if (!from) return;
        viewRef.current = {
          ...viewRef.current,
          x: viewRef.current.x + (event.clientX - from.x),
          y: viewRef.current.y + (event.clientY - from.y),
        };
        dragRef.current = { x: event.clientX, y: event.clientY };
        scheduleDraw();
      }}
      onPointerUp={() => {
        dragRef.current = null;
      }}
    >
      <canvas ref={canvasRef} className="viewer-canvas" />
      {paintedSheet !== sheetId && (
        <p className="viewer-render-message">
          {failedSheet === sheetId
            ? `${sheetId} unavailable`
            : `Opening ${sheetId}…`}
        </p>
      )}
    </div>
  );
}

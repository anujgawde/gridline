import { useEffect, useRef, useState } from "react";

import type { SheetIndexEntry, SheetSource } from "../sources";
import { combinedUrl } from "../sources";
import { usePanZoom } from "./pan-zoom";
import type { RenderState, ViewControls } from "./types";

/* The naive renderer, built honestly rather than as a straw man.
   
   It does what you do when someone hands you a drawing set and asks you to
   display it: open the file, render the page, put it on screen. Three properties
   follow from that, and all three are deliberate:

     - It opens the set as issued — one document, 1,500 pages, 42 MB. Handing it
       pre-split sheets would be giving it a decomposition it did not earn.
     - pdf.js parses on the main thread, so parsing competes with rendering.
     - A rendered page is kept. Re-rendering is visibly slow, so the obvious fix
       is to hold on to what you drew — and nothing ever evicts it. This is the
       single most common shape of the problem, and it is what makes a long
       session fail rather than merely feel slow.

   Nothing here is exaggerated for effect. Every one of those is what the
   straightforward implementation does. */

// An ARCH E1 sheet is 3024pt wide. Rasterizing it this wide gives roughly a
// 4000 x 2857 canvas — about 45 MB of pixels per sheet, held forever.
const TARGET_WIDTH = 4000;

interface Props {
  sheetId: string;
  source: SheetSource;
  index: SheetIndexEntry[];
  onPainted?: (sheetId: string) => void;
  /* Handed upward so the viewer's toolbar can drive whichever renderer is
     mounted without knowing which one that is. */
  onControls?: (controls: ViewControls) => void;
}

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");

  /* Forces pdf.js onto the main thread. PDFWorker checks this global before
     starting a real worker and falls back to a loopback port when it is set.
     The tiled renderer sets GlobalWorkerOptions.workerSrc instead. */
  (globalThis as Record<string, unknown>).pdfjsWorker = await import(
    // @ts-expect-error -- the worker build ships without type declarations
    "pdfjs-dist/build/pdf.worker.mjs"
  );

  return pdfjs;
}

export function FullPageRenderer({
  sheetId,
  source,
  index,
  onPainted,
  onControls,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  /* The gesture target is the surface, not the transform target: scaling the
     element the listeners are on would scale the coordinates they report. */
  const surfaceRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<Awaited<ReturnType<typeof openDocument>> | null>(null);
  /* Every page ever rendered, kept. No budget, no eviction. */
  const cacheRef = useRef(new Map<number, HTMLCanvasElement>());
  const [state, setState] = useState<RenderState>("loading");
  const [sheetCount, setSheetCount] = useState(0);
  const [pixelBytes, setPixelBytes] = useState(0);

  const { viewport, controls } = usePanZoom(sheetId, surfaceRef);

  useEffect(() => {
    onControls?.(controls);
  }, [controls, onControls]);

  useEffect(() => {
    let cancelled = false;

    async function show() {
      setState("loading");
      performance.mark("gridline:sheet-start");

      try {
        const entry = index.find((s) => s.sheetId === sheetId);
        if (!entry) throw new Error(`${sheetId} is not in the sheet index`);

        if (!docRef.current) {
          /* Opening the whole set. Paid once per session — and it is the cost
             that makes the first sheet expensive while every later one is not. */
          performance.mark("gridline:doc-open-start");
          docRef.current = await openDocument(combinedUrl(source));
          if (cancelled) return;
          performance.mark("gridline:doc-open-end");
          performance.measure(
            "gridline:document-open",
            "gridline:doc-open-start",
            "gridline:doc-open-end",
          );
        }

        const doc = docRef.current;
        setSheetCount(doc.numPages);

        let canvas = cacheRef.current.get(entry.pageNumber);
        if (!canvas) {
          performance.mark("gridline:raster-start");
          canvas = await rasterize(doc, entry.pageNumber);
          if (cancelled) return;
          performance.mark("gridline:raster-end");
          performance.measure(
            "gridline:sheet-raster",
            "gridline:raster-start",
            "gridline:raster-end",
          );
          cacheRef.current.set(entry.pageNumber, canvas);
        }

        /* Reported by the app because nothing else can see it. A canvas's
           pixels live outside the JS heap, so JSHeapUsedSize does not count
           them and `performance.memory` does not either — a renderer holding a
           gigabyte of bitmaps looks idle to both. Width x height x 4 is exact,
           and it is the quantity that grows with every sheet visited. */
        let bytes = 0;
        for (const held of cacheRef.current.values()) {
          bytes += held.width * held.height * 4;
        }
        setPixelBytes(bytes);

        const host = hostRef.current;
        if (!host) return;
        host.replaceChildren(canvas);

        performance.mark("gridline:sheet-painted");
        performance.measure(
          "gridline:sheet-shown",
          "gridline:sheet-start",
          "gridline:sheet-painted",
        );

        setState("painted");
        onPainted?.(sheetId);
      } catch (error) {
        if (cancelled) return;
        /* Stays inside this slot. A sheet that will not render is a rendering
           failure, not something to throw at whatever embedded this. */
        console.error(`[viewer] ${sheetId} failed to render`, error);
        setState("failed");
      }
    }

    void show();
    return () => {
      cancelled = true;
    };
  }, [sheetId, source, index, onPainted]);

  return (
    <div
      className="viewer-render"
      data-renderer="fullpage"
      data-state={state}
      data-sheet={sheetId}
      data-pages-held={cacheRef.current.size}
      data-pixels-mb={Math.round((pixelBytes / 1024 / 1024) * 10) / 10}
      data-sheet-count={sheetCount}
      ref={surfaceRef}
    >
      <div
        ref={hostRef}
        className="viewer-canvas-host"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
        }}
      />
      {state !== "painted" && (
        <p className="type-caption text-fg-tertiary">
          {state === "loading" ? `Opening ${sheetId}…` : `${sheetId} unavailable`}
        </p>
      )}
    </div>
  );
}

async function openDocument(url: string) {
  const pdfjs = await loadPdfjs();
  return pdfjs.getDocument({ url }).promise;
}

async function rasterize(
  doc: Awaited<ReturnType<typeof openDocument>>,
  pageNumber: number,
) {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: TARGET_WIDTH / base.width });

  const canvas = document.createElement("canvas");
  canvas.className = "viewer-canvas";
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  const context = canvas.getContext("2d");
  if (!context) throw new Error("2d context unavailable");

  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return canvas;
}

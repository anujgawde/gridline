import { useEffect, useRef, useState } from "react";

import type { RenderState, SheetRendererProps } from "./types";

/* The whole sheet, rasterized in one pass, parsed on the main thread.

   This is the honest naive implementation, not a straw man: it is what you write
   before you know the document is too big for it. Its numbers are the baseline
   every later optimisation is measured against, and they can only be taken while
   it is the thing running — which is why it stays in the app rather than being
   deleted once the tiled renderer exists.

   Two properties make it slow, and both are deliberate:
     - pdf.js parses on the main thread, so parsing competes with rendering
     - the entire page is rasterized at a resolution you could zoom into, so the
       cost is the size of the sheet rather than the size of the screen */

// An ARCH E1 sheet is 3024pt wide. Rasterizing it this wide is roughly a
// 4000 x 2857 canvas — about 45 MB of pixels, for one sheet.
const TARGET_WIDTH = 4000;

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");

  /* Forces pdf.js onto the main thread. PDFWorker checks this global before it
     tries to start a real worker, and falls back to a loopback port when it is
     set — so parsing runs in the same thread as rendering. The tiled renderer
     will set `GlobalWorkerOptions.workerSrc` instead and get a real worker. */
  (globalThis as Record<string, unknown>).pdfjsWorker = await import(
    // @ts-expect-error -- the worker build ships without type declarations
    "pdfjs-dist/build/pdf.worker.mjs"
  );

  return pdfjs;
}

export function FullPageRenderer({ sheetId, url, onPainted }: SheetRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<RenderState>("loading");

  useEffect(() => {
    let cancelled = false;

    async function render() {
      setState("loading");
      performance.mark("gridline:load-start");

      try {
        /* Three separate spans, because they fail and improve for completely
           different reasons and lumping them together hides which one is the
           problem. Fetching the pdf.js library is a bundle question; parsing is a
           document question; rasterizing is a pixels question. */
        const pdfjs = await loadPdfjs();
        if (cancelled) return;
        performance.mark("gridline:pdfjs-ready");

        const doc = await pdfjs.getDocument({ url }).promise;
        if (cancelled) return;
        performance.mark("gridline:doc-loaded");

        const page = await doc.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: TARGET_WIDTH / base.width });

        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        const context = canvas.getContext("2d");
        if (!context) throw new Error("2d context unavailable");

        performance.mark("gridline:raster-start");
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        if (cancelled) return;

        performance.mark("gridline:painted");
        // Fetching and evaluating the pdf.js library. A bundle cost, not a
        // document cost — and on a cold load it is on the critical path.
        performance.measure(
          "gridline:pdfjs-load",
          "gridline:load-start",
          "gridline:pdfjs-ready",
        );
        // Fetching and parsing this sheet, with the library already in memory.
        performance.measure(
          "gridline:sheet-parse",
          "gridline:pdfjs-ready",
          "gridline:doc-loaded",
        );
        // Turning the parsed page into pixels. The number tiling exists to move.
        performance.measure(
          "gridline:sheet-raster",
          "gridline:raster-start",
          "gridline:painted",
        );
        performance.measure(
          "gridline:sheet-first-paint",
          "gridline:load-start",
          "gridline:painted",
        );

        setState("painted");
        onPainted?.();
      } catch (error) {
        if (cancelled) return;
        /* Stays inside this slot. A sheet that will not load is a rendering
           failure, not something to throw at whatever embedded this. */
        console.error(`[viewer] ${sheetId} failed to render`, error);
        setState("failed");
      }
    }

    void render();
    return () => {
      cancelled = true;
    };
  }, [sheetId, url, onPainted]);

  return (
    <div className="viewer-render" data-renderer="fullpage" data-state={state}>
      <canvas ref={canvasRef} className="viewer-canvas" />
      {state !== "painted" && (
        <p className="viewer-render-message">
          {state === "loading" ? `Loading ${sheetId}…` : `${sheetId} unavailable`}
        </p>
      )}
    </div>
  );
}

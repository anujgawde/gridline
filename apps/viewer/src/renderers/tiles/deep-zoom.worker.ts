/* Renders a region of one sheet at high resolution, off the main thread.

   Everything pdf.js does happens here. The main thread sends a sheet-space
   rectangle and a pixel width; it gets back an ImageBitmap. The document is kept
   between requests because someone zooming around one sheet will ask repeatedly,
   and re-parsing a 28 KB PDF each time would be the same mistake in miniature. */

// First: every chunk loaded after this resolves against the viewer's origin.
import "./worker-public-path";

import type { PDFDocumentProxy } from "pdfjs-dist";

import { OffscreenCanvasFactory } from "./offscreen-canvas-factory";

interface Request {
  id: number;
  baseUrl: string;
  sheetId: string;
  file: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pixelWidth: number;
}

let pdfjs: typeof import("pdfjs-dist") | null = null;
let openFile: string | null = null;
let doc: PDFDocumentProxy | null = null;

async function loadPdfjs() {
  const library = await import("pdfjs-dist");
  /* pdf.js would otherwise start a worker of its own, from a script on this
     remote's origin, and meet the same-origin rule all over again. With this
     global set it runs its worker half here, in this thread, which is already
     off the main one. */
  (globalThis as Record<string, unknown>).pdfjsWorker = await import(
    // @ts-expect-error -- the worker build ships without type declarations
    "pdfjs-dist/build/pdf.worker.mjs"
  );
  return library;
}

async function ensureDocument(baseUrl: string, file: string) {
  pdfjs ??= await loadPdfjs();

  if (openFile === file && doc) return doc;

  await doc?.cleanup();
  /* One sheet's own PDF — about 28 KB — not the 42 MB set.

     Three of pdf.js's defaults assume a page. A string URL is resolved
     against `window.location`, so the URL goes in already absolute. Scratch
     canvases come from `document`, so the factory makes OffscreenCanvas.
     Fonts are added to `document.fonts`, and a worker has its own FontFaceSet,
     which is where text drawn on an OffscreenCanvas here looks them up. */
  doc = await pdfjs.getDocument({
    url: new URL(`${baseUrl}/sheets/${file}`),
    CanvasFactory: OffscreenCanvasFactory,
    // Only `fonts` is read once CanvasFactory is replaced; the type wants a
    // whole Document.
    ownerDocument: { fonts: (self as unknown as Document).fonts } as Document,
  }).promise;
  openFile = file;
  return doc;
}

self.addEventListener("message", async (event: MessageEvent<Request>) => {
  const request = event.data;

  try {
    const document = await ensureDocument(request.baseUrl, request.file);
    const page = await document.getPage(1);

    const scale = request.pixelWidth / request.width;
    const pixelHeight = Math.round(request.height * scale);

    const canvas = new OffscreenCanvas(request.pixelWidth, pixelHeight);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("2d context unavailable");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    /* Renders the whole page transformed so the requested rectangle fills the
       canvas. pdf.js has no crop, so the offset goes into the viewport. */
    const viewport = page.getViewport({
      scale,
      offsetX: -request.x * scale,
      offsetY: -request.y * scale,
    });

    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;

    const bitmap = canvas.transferToImageBitmap();
    self.postMessage(
      {
        id: request.id,
        sheetId: request.sheetId,
        bitmap,
        x: request.x,
        y: request.y,
        width: request.width,
        height: request.height,
      },
      { transfer: [bitmap] },
    );
  } catch (error) {
    /* Reported back rather than logged here. A worker's console is not the
       page's, so an error swallowed in here is invisible from the outside —
       which is exactly how this failed silently the first time. */
    self.postMessage({
      id: request.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

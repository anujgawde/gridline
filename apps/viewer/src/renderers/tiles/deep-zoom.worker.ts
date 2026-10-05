/* Renders a region of one sheet at high resolution, off the main thread.

   Everything pdf.js does happens here. The main thread sends a sheet-space
   rectangle and a pixel width; it gets back an ImageBitmap. The document is kept
   between requests because someone zooming around one sheet will ask repeatedly,
   and re-parsing a 28 KB PDF each time would be the same mistake in miniature. */

import type { PDFDocumentProxy } from "pdfjs-dist";

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

async function ensureDocument(baseUrl: string, file: string) {
  pdfjs ??= await import("pdfjs-dist");

  if (openFile === file && doc) return doc;

  await doc?.cleanup();
  /* One sheet's own PDF — about 28 KB — not the 42 MB set. */
  doc = await pdfjs.getDocument({ url: `${baseUrl}/sheets/${file}` }).promise;
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

import type { TileIndex } from "./types";

/* Rendering past the deepest pre-rendered level, from the sheet's own PDF.

   The pyramid stops at 4096px because each further level costs four times the
   disk. Past it, a tile can only be stretched — which goes soft exactly the way
   the naive renderer does past its own resolution. For a drawing that is a real
   limitation: reading a dimension string is the reason someone zooms in.

   So beyond the pyramid the page is rasterized on demand from its own PDF,
   which is ~28 KB rather than the 42 MB of the whole set. That is what keeps
   pdf.js off the cold path while still allowing sharp deep zoom: the library
   loads the first time someone zooms past level 3 and not before.

   The work runs in a worker. pdf.js parsing on the main thread is what the
   baseline measured as an 875 ms task, and nothing about doing it later makes
   it cheaper — it just moves when the page freezes. */

export interface DeepZoomRequest {
  sheetId: string;
  /* The PDF of the revision on screen, under `sheets/`. */
  file: string;
  /* Sheet-space rectangle to render, in points. */
  x: number;
  y: number;
  width: number;
  height: number;
  /* Device pixels across, for the rendered result. */
  pixelWidth: number;
}

export interface DeepZoomResult {
  sheetId: string;
  bitmap: ImageBitmap;
  x: number;
  y: number;
  width: number;
  height: number;
}

/* The level past which the pyramid has nothing sharper to offer. */
export function needsDeepZoom(index: TileIndex, scale: number) {
  const deepest = index.levels[index.levels.length - 1];
  if (!deepest) return false;
  /* The pyramid's deepest level renders the page at `deepest.width` pixels.
     Once the viewport is showing it larger than that, every pixel on screen is
     an upscale. */
  return index.pageWidth * scale > deepest.width;
}

/* Talks to the worker. One request at a time: a deep-zoom render is expensive
   and the only one that matters is the one for where the viewport is now. */
export class DeepZoomRenderer {
  #worker: Worker | null = null;
  #bootstrapUrl: string | null = null;
  #pending: number | null = null;
  #nextId = 0;

  constructor(
    private readonly baseUrl: string,
    private readonly onResult: (result: DeepZoomResult) => void,
  ) {}

  #ensureWorker() {
    if (this.#worker) return this.#worker;

    /* Created on first use, so the pdf.js bundle is not fetched until someone
       actually zooms past the pyramid. Most sessions never will.

       The blob is not a convenience. A worker script must be same-origin as the
       *document*, and this remote is served from its own origin but runs inside
       the shell's page — so `new Worker("http://localhost:4101/...")` is refused
       outright, and no CORS header changes that. The workaround is a tiny
       same-origin module that imports the real one: a blob URL inherits the
       document's origin, and a dynamic import from it resolves absolutely, so
       the worker's own chunks still load from the remote that owns them.

       This is a constraint any federated remote shipping a worker meets. */
    const href = new URL("./deep-zoom.worker.ts", import.meta.url).href;
    const bootstrap = URL.createObjectURL(
      new Blob([`import ${JSON.stringify(href)};`], {
        type: "text/javascript",
      }),
    );

    this.#worker = new Worker(bootstrap, { type: "module" });
    this.#bootstrapUrl = bootstrap;
    /* Revoked when the worker is torn down, not here. The worker fetches the
       blob asynchronously, so revoking synchronously after construction pulls
       the script out from under it — and the failure arrives as an ErrorEvent
       with no message, which says nothing about the cause. */

    this.#worker.addEventListener(
      "message",
      (event: MessageEvent<DeepZoomResult & { id: number; error?: string }>) => {
        if (event.data.error) {
          console.error(
            `[viewer] deep zoom failed: ${event.data.error}`,
          );
          this.#pending = null;
          return;
        }
        if (event.data.id !== this.#pending) {
          /* A result for a viewport that has already moved on. Releasing it
             rather than drawing it keeps stale pixels off the canvas. */
          event.data.bitmap.close();
          return;
        }
        this.#pending = null;
        this.onResult(event.data);
      },
    );

    this.#worker.addEventListener("error", (event) => {
      console.error("[viewer] deep zoom worker failed", event.message);
      this.#pending = null;
    });

    return this.#worker;
  }

  request(request: DeepZoomRequest) {
    const worker = this.#ensureWorker();
    const id = (this.#nextId += 1);
    this.#pending = id;
    worker.postMessage({ ...request, id, baseUrl: this.baseUrl });
  }

  get busy() {
    return this.#pending !== null;
  }

  destroy() {
    this.#worker?.terminate();
    this.#worker = null;
    if (this.#bootstrapUrl) URL.revokeObjectURL(this.#bootstrapUrl);
    this.#bootstrapUrl = null;
    this.#pending = null;
  }
}

import { detect } from "./detect";
import type { ChangeRegion, DetectRequest, TilePlacement } from "./types";
import type { Size } from "../view";

/* Fetches both revisions' tiles, flattens each to one luminance image and
   diffs them. Normally run in the worker; `?detect=main` runs the same code
   on the page's thread, which is what the worker exists to avoid. */
export async function runDetection(request: DetectRequest): Promise<{ regions: ChangeRegion[]; ms: number }> {
  const started = performance.now();
  const [from, to] = await Promise.all([luminance(request.from, request.image), luminance(request.to, request.image)]);
  return { regions: detect(from, to, request.image, request.page), ms: Math.round(performance.now() - started) };
}

async function luminance(tiles: TilePlacement[], size: Size) {
  const canvas = new OffscreenCanvas(size.width, size.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d context for detection");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size.width, size.height);

  await Promise.all(
    tiles.map(async ({ url, x, y }) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${url} responded ${response.status}`);
      const bitmap = await createImageBitmap(await response.blob());
      ctx.drawImage(bitmap, x, y);
      bitmap.close();
    }),
  );

  // Rec. 601 weights in eighths of 256, so the pass stays in integers.
  const { data } = ctx.getImageData(0, 0, size.width, size.height);
  const out = new Uint8Array(size.width * size.height);
  for (let i = 0; i < out.length; i++) {
    out[i] = (data[i * 4]! * 77 + data[i * 4 + 1]! * 150 + data[i * 4 + 2]! * 29) >> 8;
  }
  return out;
}

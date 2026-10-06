import { detect } from "./detect";
import type { DetectRequest, DetectResponse, TilePlacement } from "./types";
import type { Size } from "../view";

/* Fetches both revisions' tiles, flattens each to one luminance image and
   diffs them. Everything here would otherwise block the page: a dozen
   decodes, two full-level readbacks and a pass over a few million pixels. */
self.onmessage = async ({ data }: MessageEvent<DetectRequest>) => {
  const reply = (response: DetectResponse) => self.postMessage(response);
  try {
    const started = performance.now();
    const [from, to] = await Promise.all([luminance(data.from, data.image), luminance(data.to, data.image)]);
    reply({ regions: detect(from, to, data.image, data.page), ms: Math.round(performance.now() - started) });
  } catch (error) {
    reply({ error: error instanceof Error ? error.message : String(error) });
  }
};

async function luminance(tiles: TilePlacement[], size: Size) {
  const canvas = new OffscreenCanvas(size.width, size.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d context in the worker");
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

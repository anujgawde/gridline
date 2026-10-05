import { tileIndexUrl } from "./paths";
import { TileIndex } from "./schema";
import type { PyramidRef } from "./types";

export async function loadTileIndex(ref: PyramidRef): Promise<TileIndex> {
  const url = tileIndexUrl(ref);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  return TileIndex.parse(await response.json());
}

/* Decoded off the main thread by createImageBitmap, rather than through an
   <img> the page would decode while drawing. */
export async function loadTile(
  url: string,
  signal: AbortSignal,
): Promise<ImageBitmap> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  return createImageBitmap(await response.blob());
}

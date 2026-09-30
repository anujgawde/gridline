import { z } from "zod";

import type { TileCache } from "./tile-cache";
import { tileId } from "./tile-cache";
import type { TileIndex, TileKey } from "./types";

/* Validated on read, like every document arriving over the network. */
const TileIndexShape = z.object({
  sheetId: z.string().min(1),
  title: z.string(),
  discipline: z.string(),
  pageWidth: z.number().positive(),
  pageHeight: z.number().positive(),
  levels: z
    .object({
      level: z.number().int().nonnegative(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      cols: z.number().int().positive(),
      rows: z.number().int().positive(),
    })
    .array()
    .min(1),
});

/* Indexes already fetched, kept for the life of the page.

   A tile index is 353 bytes, but fetching one costs a round trip — 562 ms on the
   link these measurements use. Re-fetching it every time someone returns to a
   sheet made revisiting cost as much as a first visit, for a file describing a
   sheet already open once. */
const indexes = new Map<string, TileIndex>();

export async function loadTileIndex(
  baseUrl: string,
  sheetId: string,
): Promise<TileIndex | null> {
  const cached = indexes.get(sheetId);
  if (cached) return cached;

  const url = `${baseUrl}/tiles/${sheetId}/tile-index.json`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} responded ${response.status}`);
    const index = TileIndexShape.parse(await response.json());
    indexes.set(sheetId, index);
    return index;
  } catch (error) {
    console.error(`[viewer] tile index for ${sheetId} unavailable`, error);
    return null;
  }
}

/* Fetches and decodes tiles into a bounded cache.

   `createImageBitmap` decodes off the main thread, which is the difference
   between a tile arriving and a tile blocking. The naive renderer's equivalent
   step — rasterizing a page — has no such escape, and shows up as an 875 ms task
   in the baseline. */
/* At most this many tile fetches outstanding at once.

   A browser opens six connections per origin, so issuing more than that does
   not make anything arrive sooner — it just fills a queue the application
   cannot reorder. That queue is the problem: a pan at deep zoom asks for two
   dozen tiles, and if the person then changes sheet, the request they are
   actually waiting for sits behind all of them. Measured at 2.7 seconds of
   pure queueing for a 353-byte file.

   Holding the queue here instead means it can be thrown away. */
const MAX_IN_FLIGHT = 4;

export class TileLoader {
  /* One request per tile, however many times it is asked for. Panning asks for
     the same tile on consecutive frames, and without this each frame would start
     another fetch. */
  #inFlight = new Map<string, Promise<void>>();
  #aborts = new Map<string, AbortController>();
  #queue: { id: string; url: string; onReady: () => void }[] = [];

  constructor(
    private readonly baseUrl: string,
    private readonly cache: TileCache,
  ) {}

  /* Returns what is already decoded, and starts fetching what is not.
     Deliberately not awaited by the draw loop: a frame draws what it has and
     the next frame draws more, rather than waiting for the network. */
  request(sheetId: string, keys: TileKey[], onReady: () => void) {
    const ready: { key: TileKey; bitmap: ImageBitmap }[] = [];

    for (const key of keys) {
      const id = tileId(sheetId, key);
      const bitmap = this.cache.get(id);
      if (bitmap) {
        ready.push({ key, bitmap });
        continue;
      }
      if (this.#inFlight.has(id)) continue;

      if (this.#queue.some((q) => q.id === id)) continue;
      this.#queue.push({
        id,
        url: `${this.baseUrl}/tiles/${sheetId}/l${key.level}/${key.col}_${key.row}.webp`,
        onReady,
      });
    }

    this.#pump();

    return ready;
  }

  #pump() {
    while (this.#inFlight.size < MAX_IN_FLIGHT && this.#queue.length > 0) {
      const next = this.#queue.shift();
      if (!next) break;
      this.#start(next.id, next.url, next.onReady);
    }
  }

  #start(id: string, url: string, onReady: () => void) {
    const abort = new AbortController();
    this.#aborts.set(id, abort);

    const task = fetch(url, { signal: abort.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`${url} responded ${response.status}`);
        return response.blob();
      })
      .then((blob) => createImageBitmap(blob))
      .then((decoded) => {
        this.cache.set(id, decoded);
        onReady();
      })
      .catch((error: unknown) => {
        /* A missing tile leaves a gap. It does not fail the sheet, and it does
           not throw at whatever embedded this remote. An abort is not a failure
           at all — it is a request for a sheet nobody is looking at any more. */
        if ((error as { name?: string })?.name === "AbortError") return;
        console.error(`[viewer] tile ${id} failed`, error);
      })
      .finally(() => {
        this.#inFlight.delete(id);
        this.#aborts.delete(id);
        this.#pump();
      });

    this.#inFlight.set(id, task);
  }

  /* Drops every request that is not for this sheet.

     Without it, navigating away leaves the previous sheet's deep-zoom tiles
     competing for the connection, and the sheet someone is actually waiting for
     queues behind tiles for a sheet they have left. On a paced link that was
     measured at nearly four seconds per sheet change. */
  abortExcept(sheetId: string) {
    /* The queue first: these have not been sent, so dropping them costs
       nothing and frees the slots immediately. */
    this.#queue = this.#queue.filter((q) => q.id.startsWith(`${sheetId}/`));
    for (const [id, controller] of this.#aborts) {
      if (!id.startsWith(`${sheetId}/`)) controller.abort();
    }
  }

  get pending() {
    return this.#inFlight.size + this.#queue.length;
  }
}

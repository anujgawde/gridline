import { z } from "zod";

import type { TileCache } from "./tile-cache";
import { tileId } from "./tile-cache";
import type { TileIndex, TileKey, TileLoaderStats } from "./types";

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

/* Keyed by tile directory rather than sheet number, since each revision of a
   sheet has its own pyramid. */
export async function loadTileIndex(
  baseUrl: string,
  dir: string,
): Promise<TileIndex | null> {
  const cached = indexes.get(dir);
  if (cached) return cached;

  const url = `${baseUrl}/tiles/${dir}/tile-index.json`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} responded ${response.status}`);
    const index = TileIndexShape.parse(await response.json());
    indexes.set(dir, index);
    return index;
  } catch (error) {
    console.error(`[viewer] tile index for ${dir} unavailable`, error);
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

/* Of those slots, how many a speculative request may occupy.

   One, and the gate below is stricter still: prefetch starts only when nothing
   live is queued or in flight. The failure this guards against is the one 2.1
   fixed — a second source of fetches competing with the sheet someone is waiting
   for, which cost nearly four seconds a sheet change. A guess must never be in
   front of a request.

   One slot also bounds the damage when the guess is wrong: a 13 KB tile on a
   1.6 Mbit/s link is ~65 ms of link time, so a live request that arrives mid
   prefetch waits at most that long for a free connection. */
const MAX_PREFETCH_IN_FLIGHT = 1;

export class TileLoader {
  /* One request per tile, however many times it is asked for. Panning asks for
     the same tile on consecutive frames, and without this each frame would start
     another fetch. */
  #inFlight = new Map<string, Promise<void>>();
  #aborts = new Map<string, AbortController>();
  #queue: { id: string; url: string; onReady: () => void }[] = [];
  /* Every tile this loader still owes an answer for, queued or in flight.
     `#inFlight` cannot serve that purpose: it holds only what has actually
     started, so a tile waiting behind MAX_IN_FLIGHT has no promise there to
     await. */
  #outstanding = new Map<string, { done: Promise<void>; settle: () => void }>();
  /* The tiles the renderer needed on the previous request. Hit rate is counted
     against entry into this set rather than per lookup, because the draw loop
     asks for the same tiles on every frame — see TileLoaderStats. */
  #needed = new Set<string>();
  #hits = 0;
  #misses = 0;
  /* Speculative work, held apart from `#queue` so it can never be drained ahead
     of it. Entries carry no `onReady`: nothing they fetch is on screen, so a
     redraw on arrival would be a frame spent painting what is already painted. */
  #prefetchQueue: { id: string; url: string }[] = [];
  /* Which of `#inFlight` are speculative. They share the in-flight map so dedup
     and abort work on them unchanged — a tile being prefetched must not be
     fetched a second time when it is actually needed, which is the duplicate
     that stranded pixels in 2.1. */
  #prefetching = new Set<string>();

  /* `dirOf` maps a sheet to the directory of the revision being shown. Tile
     ids stay keyed by sheet number alone: the viewer shows one revision of a
     sheet at a time, so two revisions never share the cache. Showing two would
     mean putting the revision into `tileId`. */
  constructor(
    private readonly baseUrl: string,
    private readonly cache: TileCache,
    private readonly dirOf: (sheetId: string) => string,
  ) {}

  /* Returns what is already decoded, and starts fetching what is not.
     Deliberately not awaited by the draw loop: a frame draws what it has and
     the next frame draws more, rather than waiting for the network. */
  request(sheetId: string, keys: TileKey[], onReady: () => void) {
    const ready: { key: TileKey; bitmap: ImageBitmap }[] = [];
    const needed = new Set<string>();

    for (const key of keys) {
      const id = tileId(sheetId, key);
      needed.add(id);
      const bitmap = this.cache.get(id);

      /* Counted only when the tile was not needed on the previous request. The
         same tile asked for on thirty consecutive frames is one need, however
         many lookups it takes. */
      if (!this.#needed.has(id)) {
        if (bitmap) this.#hits += 1;
        else this.#misses += 1;
      }

      if (bitmap) {
        ready.push({ key, bitmap });
        continue;
      }
      if (this.#inFlight.has(id)) continue;

      if (this.#queue.some((q) => q.id === id)) continue;

      let settle = () => {};
      const done = new Promise<void>((resolve) => {
        settle = resolve;
      });
      this.#outstanding.set(id, { done, settle });

      this.#queue.push({ id, url: this.#urlFor(sheetId, key), onReady });
    }

    /* Replaced wholesale, which is what makes a tile leaving the viewport and
       coming back count as a second need. Each call carries one complete "what
       is needed now" set — the draw loop passes the visible tiles of a single
       level, and sheet open passes a sheet's coarse tiles — so there is no
       partial update to merge. */
    this.#needed = needed;

    this.#pump();

    return ready;
  }

  /* Tiles for a sheet nobody has opened, fetched on the chance they open it.

     Not counted as hits or misses. A prefetch is not a need, and folding it into
     the rate would answer "how often did we guess right?" under a name that says
     "how often was it there when required?". A prefetched tile counts as a hit
     later, when it is actually needed — which is the whole point of doing it. */
  prefetch(sheetId: string, keys: TileKey[]) {
    for (const key of keys) {
      const id = tileId(sheetId, key);
      /* `has` rather than `get`, so looking does not mark the tile recently
         used. A speculative tile should not be able to save itself, or a wrong
         guess would evict a sheet someone actually visited. */
      if (this.cache.has(id)) continue;
      if (this.#inFlight.has(id)) continue;
      if (this.#queue.some((q) => q.id === id)) continue;
      if (this.#prefetchQueue.some((q) => q.id === id)) continue;

      this.#prefetchQueue.push({ id, url: this.#urlFor(sheetId, key) });
    }

    this.#pump();
  }

  #urlFor(sheetId: string, key: TileKey) {
    return `${this.baseUrl}/tiles/${this.dirOf(sheetId)}/l${key.level}/${key.col}_${key.row}.webp`;
  }

  /* Live requests in flight. Prefetches share `#inFlight` for dedup, so the
     count that decides whether the link is busy has to exclude them. */
  get #liveInFlight() {
    return this.#inFlight.size - this.#prefetching.size;
  }

  #pump() {
    while (this.#inFlight.size < MAX_IN_FLIGHT && this.#queue.length > 0) {
      const next = this.#queue.shift();
      if (!next) break;
      this.#start(next.id, next.url, next.onReady);
    }

    /* Only when nothing live is outstanding at all — not merely when a slot is
       free. A tile someone is waiting for must never share the link with a
       guess, and the queue above can refill at any frame. */
    if (this.#queue.length > 0 || this.#liveInFlight > 0) return;

    while (
      this.#prefetching.size < MAX_PREFETCH_IN_FLIGHT &&
      this.#inFlight.size < MAX_IN_FLIGHT &&
      this.#prefetchQueue.length > 0
    ) {
      const next = this.#prefetchQueue.shift();
      if (!next) break;
      this.#prefetching.add(next.id);
      this.#start(next.id, next.url, () => {});
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
        this.#prefetching.delete(id);
        this.#aborts.delete(id);
        this.#settle(id);
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
    const dropped = this.#queue.filter((q) => !q.id.startsWith(`${sheetId}/`));
    this.#queue = this.#queue.filter((q) => q.id.startsWith(`${sheetId}/`));
    /* A dropped request still owes an answer to anything awaiting it. Without
       this, a sheet open abandoned mid-flight never resolves. */
    for (const entry of dropped) this.#settle(entry.id);
    /* Every guess is discarded, including ones for the sheet being opened. The
       neighbours change with the sheet, so the set is recomputed anyway, and
       anything still genuinely wanted is about to be asked for as a live
       request — which is where it belongs. */
    this.#prefetchQueue = [];
    for (const [id, controller] of this.#aborts) {
      if (!id.startsWith(`${sheetId}/`)) controller.abort();
    }
  }

  /* Resolves once each of these tiles is decoded, missing or aborted.

     The draw loop deliberately never awaits tiles — a frame draws what it has.
     Sheet open is the exception: it paints once, and the coarse tile has to be
     in that paint, or `painted` would mean a blank canvas. Awaiting here rather
     than fetching directly keeps sheet open inside the same queue, cap and
     abort set as every other request. */
  async settled(sheetId: string, keys: TileKey[]) {
    await Promise.all(
      keys
        .map((key) => this.#outstanding.get(tileId(sheetId, key))?.done)
        .filter((done): done is Promise<void> => done !== undefined),
    );
  }

  /* Releases whatever is awaiting this tile, whichever way it went. Decoded,
     missing and aborted all count: a caller waiting to paint needs to stop
     waiting, not to be told it succeeded. */
  #settle(id: string) {
    const entry = this.#outstanding.get(id);
    if (!entry) return;
    this.#outstanding.delete(id);
    entry.settle();
  }

  stats(): TileLoaderStats {
    return {
      hits: this.#hits,
      misses: this.#misses,
      pending: this.#liveInFlight + this.#queue.length,
      prefetchPending: this.#prefetchQueue.length + this.#prefetching.size,
    };
  }
}

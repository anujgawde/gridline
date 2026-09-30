import type { TileCacheStats, TileKey } from "./types";

/* A bounded cache of decoded tiles, evicted least-recently-used.

   The bound is the point. Tiles are not automatically cheaper than a full-page
   raster: a 512x512 tile is ~18 KB on the wire but 1 MB decoded, so a whole
   sheet's worth of level-3 tiles is about what the naive renderer's single
   canvas costs. What makes tiles cheap is that only the ones on screen are
   decoded, and the ones behind you are released.

   Without eviction this would grow exactly the way the naive renderer does —
   which is the failure the baseline recorded. */

const BYTES_PER_PIXEL = 4;

/* Levels 0 and 1 are never evicted. A whole sheet at level 0 is one tile and
   level 1 is four, so the entire set's coarse levels cost a few megabytes — and
   holding them is what lets any sheet show something immediately instead of
   showing nothing while its tiles arrive. The expensive deep-zoom tiles are
   what the budget is actually for. */
const PINNED_THROUGH_LEVEL = 1;

function levelOf(id: string) {
  return Number(id.split("/")[1] ?? 0);
}

export interface CachedTile {
  bitmap: ImageBitmap;
  bytes: number;
}

export function tileId(sheetId: string, key: TileKey) {
  return `${sheetId}/${key.level}/${key.col}_${key.row}`;
}

export class TileCache {
  /* A Map iterates in insertion order, so re-inserting on read makes the first
     entry the least recently used. That is the whole LRU. */
  #entries = new Map<string, CachedTile>();
  #bytes = 0;
  #hits = 0;
  #misses = 0;
  #evictions = 0;

  constructor(private readonly budgetBytes: number) {}

  get(id: string): ImageBitmap | undefined {
    const entry = this.#entries.get(id);
    if (!entry) {
      this.#misses += 1;
      return undefined;
    }
    this.#hits += 1;
    this.#entries.delete(id);
    this.#entries.set(id, entry);
    return entry.bitmap;
  }

  has(id: string) {
    return this.#entries.has(id);
  }

  /* Reads without counting as a use. The draw loop looks at coarse levels on
     every frame as a fallback layer, and letting that keep them "recently used"
     would mean the tiles someone is actually looking at are evicted first. */
  peek(id: string): ImageBitmap | undefined {
    return this.#entries.get(id)?.bitmap;
  }

  set(id: string, bitmap: ImageBitmap) {
    if (this.#entries.has(id)) return;

    const bytes = bitmap.width * bitmap.height * BYTES_PER_PIXEL;
    this.#entries.set(id, { bitmap, bytes });
    this.#bytes += bytes;

    while (this.#bytes > this.budgetBytes && this.#entries.size > 1) {
      let oldest: string | undefined;
      for (const key of this.#entries.keys()) {
        if (levelOf(key) > PINNED_THROUGH_LEVEL) {
          oldest = key;
          break;
        }
      }
      // Everything left is pinned; the budget cannot be met by evicting more.
      if (oldest === undefined) break;

      const evicted = this.#entries.get(oldest);
      this.#entries.delete(oldest);
      if (evicted) {
        this.#bytes -= evicted.bytes;
        /* Releases the decoded pixels immediately rather than waiting for the
           collector. An ImageBitmap holds memory outside the JS heap, so it is
           not something GC pressure reliably reclaims in time. */
        evicted.bitmap.close();
        this.#evictions += 1;
      }
    }
  }

  stats(): TileCacheStats {
    return {
      bytes: this.#bytes,
      count: this.#entries.size,
      hits: this.#hits,
      misses: this.#misses,
      evictions: this.#evictions,
    };
  }

  clear() {
    for (const entry of this.#entries.values()) entry.bitmap.close();
    this.#entries.clear();
    this.#bytes = 0;
  }
}

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

/* Levels 0 and 1 are held back from ordinary eviction. Holding them is what lets
   a revisited sheet paint immediately instead of showing nothing while its tiles
   arrive, and it is where the 71 ms revisit comes from.

   They used to be exempt from the budget outright, on the reasoning that the
   whole set's coarse levels "cost a few megabytes". That arithmetic was the
   encoded size. A sheet's level 0 and 1 are five tiles, and a tile is ~13 KB on
   the wire but 1 MB decoded — so the real cost is 5 MB per sheet visited, which
   over 1,500 sheets is 7.5 GB rather than a few megabytes. Measured: 700 MB of
   pixels after 140 sheets, growing dead straight, with eviction never once
   running because every tile in the cache was exempt from it.

   An unbounded exemption from a budget is not a budget. So the pin now has a
   budget of its own, evicted by least-recently-used *sheet* rather than by tile —
   a sheet's five coarse tiles are useful together and useless apart. */
const PINNED_THROUGH_LEVEL = 1;

function levelOf(id: string) {
  return Number(id.split("/")[1] ?? 0);
}

function sheetOf(id: string) {
  return id.split("/")[0] ?? "";
}

export interface CachedTile {
  bitmap: ImageBitmap;
  bytes: number;
  /* Resolved once at insert rather than re-parsed out of the id on every pass of
     an eviction loop. */
  pinned: boolean;
}

export function tileId(sheetId: string, key: TileKey) {
  return `${sheetId}/${key.level}/${key.col}_${key.row}`;
}

export class TileCache {
  /* A Map iterates in insertion order, so re-inserting on read makes the first
     entry the least recently used. That is the whole LRU. */
  #entries = new Map<string, CachedTile>();
  #bytes = 0;
  #pinnedBytes = 0;
  /* Sheets in least-recently-used order, so the pinned tiles of the sheet
     someone left longest ago are the ones that go. Insertion order again,
     re-inserted on use — the same mechanism as the tile LRU, one level up. */
  #sheets = new Map<string, true>();
  #evictions = 0;

  constructor(
    private readonly budgetBytes: number,
    /* The share of the budget the pinned coarse tiles may hold. Explicit rather
       than a fraction computed here, because it is policy and policy belongs
       beside the other budget, in the renderer. */
    private readonly pinnedBudgetBytes: number,
  ) {}

  /* Reads and counts as a use. Hit rate is not counted here: this is called once
     per frame per visible tile, so counting it would measure frame rate. The
     loader counts instead, where a tile newly entering the needed set is
     distinguishable from the same tile being redrawn. */
  get(id: string): ImageBitmap | undefined {
    const entry = this.#entries.get(id);
    if (!entry) return undefined;
    this.#entries.delete(id);
    this.#entries.set(id, entry);
    /* A tile being used makes its sheet recently used. Without this the sheet
       LRU would order sheets by when they were first touched, so returning to an
       old sheet would not save its coarse tiles from being dropped. */
    this.#touchSheet(sheetOf(id));
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

  /* Takes ownership of the bitmap. Every caller hands it over and does not
     touch it again, which is what lets this close one it decides not to keep. */
  set(id: string, bitmap: ImageBitmap) {
    if (this.#entries.has(id)) {
      /* Already held, so this is a second decode of the same tile. Dropping it
         without closing would strand its pixels: they live outside the JS heap,
         so the collector cannot reclaim them, and outside #bytes, so the budget
         cannot see them. The cache would then exceed its bound while its own
         counters reported compliance. */
      bitmap.close();
      return;
    }

    const bytes = bitmap.width * bitmap.height * BYTES_PER_PIXEL;
    const pinned = levelOf(id) <= PINNED_THROUGH_LEVEL;
    this.#entries.set(id, { bitmap, bytes, pinned });
    this.#bytes += bytes;
    if (pinned) this.#pinnedBytes += bytes;
    this.#touchSheet(sheetOf(id));

    this.#evictTiles();
    /* The sheet just written to is protected, or opening a sheet could drop the
       coarse tiles it is in the middle of painting. */
    this.#evictSheets(sheetOf(id));
  }

  /* Ordinary tile eviction: least-recently-used first, pinned tiles passed over.
     This is the loop that keeps the deep-zoom tiles of one sheet in check. */
  #evictTiles() {
    while (this.#bytes > this.budgetBytes && this.#entries.size > 1) {
      let oldest: string | undefined;
      for (const [key, entry] of this.#entries) {
        if (!entry.pinned) {
          oldest = key;
          break;
        }
      }
      /* Everything left is pinned. This is no longer a dead end — the pinned
         budget below is what bounds those. */
      if (oldest === undefined) break;
      this.#drop(oldest);
    }
  }

  /* Pinned eviction, a whole sheet at a time. The unit is the sheet because its
     coarse tiles only do their job together: four of five gives a sheet that
     paints with a hole in it, which is worse than one that paints late. */
  #evictSheets(protect: string) {
    while (this.#pinnedBytes > this.pinnedBudgetBytes) {
      let victim: string | undefined;
      for (const sheetId of this.#sheets.keys()) {
        if (sheetId !== protect) {
          victim = sheetId;
          break;
        }
      }
      // Only the protected sheet is left; nothing more can be given up.
      if (victim === undefined) break;

      const freed = this.#dropSheet(victim);
      this.#sheets.delete(victim);
      /* A sheet holding no pinned tiles frees nothing, so the loop would spin.
         Removing it from the order above is the progress that prevents that. */
      if (freed === 0) continue;
    }
  }

  /* Everything belonging to one sheet, pinned or not. If its coarse tiles are
     going then its deep tiles are dead weight too. */
  #dropSheet(sheetId: string) {
    let freed = 0;
    for (const key of [...this.#entries.keys()]) {
      if (sheetOf(key) !== sheetId) continue;
      freed += this.#entries.get(key)?.bytes ?? 0;
      this.#drop(key);
    }
    return freed;
  }

  #drop(id: string) {
    const evicted = this.#entries.get(id);
    if (!evicted) return;
    this.#entries.delete(id);
    this.#bytes -= evicted.bytes;
    if (evicted.pinned) this.#pinnedBytes -= evicted.bytes;
    /* Releases the decoded pixels immediately rather than waiting for the
       collector. An ImageBitmap holds memory outside the JS heap, so it is
       not something GC pressure reliably reclaims in time. */
    evicted.bitmap.close();
    this.#evictions += 1;
  }

  #touchSheet(sheetId: string) {
    this.#sheets.delete(sheetId);
    this.#sheets.set(sheetId, true);
  }

  stats(): TileCacheStats {
    return {
      bytes: this.#bytes,
      pinnedBytes: this.#pinnedBytes,
      count: this.#entries.size,
      sheets: this.#sheets.size,
      evictions: this.#evictions,
    };
  }

  clear() {
    for (const entry of this.#entries.values()) entry.bitmap.close();
    this.#entries.clear();
    this.#bytes = 0;
    this.#pinnedBytes = 0;
    this.#sheets.clear();
  }
}

import { loadTile, tileUrl } from "../pyramid";
import type { PyramidRef, TileLevel } from "../pyramid";

const key = (level: number, col: number, row: number) => `${level}/${col}_${row}`;
const levelOf = (k: string) => Number(k.slice(0, k.indexOf("/")));

/* One pane's tiles: the bitmaps it holds and the requests in flight.

   No byte budget. A pane keeps only the levels it is told to — level 0 and
   whichever level it is drawing — so what it holds is bounded by one level's
   tiles, and leaving a level closes its bitmaps rather than waiting for the
   collector to notice them. */
export class TileSet {
  private readonly loaded = new Map<string, ImageBitmap>();
  private readonly inFlight = new Map<string, AbortController>();
  private readonly ref: PyramidRef;
  private readonly onLoad: () => void;

  constructor(ref: PyramidRef, onLoad: () => void) {
    this.ref = ref;
    this.onLoad = onLoad;
  }

  get(level: number, col: number, row: number) {
    return this.loaded.get(key(level, col, row));
  }

  request(level: number, col: number, row: number) {
    const k = key(level, col, row);
    if (this.loaded.has(k) || this.inFlight.has(k)) return;

    const controller = new AbortController();
    this.inFlight.set(k, controller);
    loadTile(tileUrl(this.ref, level, col, row), controller.signal).then(
      (bitmap) => {
        // Withdrawn while it was on its way: nothing is waiting for it.
        if (this.inFlight.get(k) !== controller) return bitmap.close();
        this.inFlight.delete(k);
        this.loaded.set(k, bitmap);
        this.onLoad();
      },
      (error: unknown) => {
        if (this.inFlight.get(k) === controller) this.inFlight.delete(k);
        if (!controller.signal.aborted) console.error("[compare] tile failed", error);
      },
    );
  }

  /* Closes and cancels everything outside `levels`. */
  keepLevels(levels: number[]) {
    for (const [k, bitmap] of this.loaded) {
      if (levels.includes(levelOf(k))) continue;
      bitmap.close();
      this.loaded.delete(k);
    }
    for (const [k, controller] of this.inFlight) {
      if (levels.includes(levelOf(k))) continue;
      controller.abort();
      this.inFlight.delete(k);
    }
  }

  /* Whether all of a level's tiles are held. */
  holds(level: TileLevel) {
    let held = 0;
    for (const k of this.loaded.keys()) if (levelOf(k) === level.level) held += 1;
    return held === level.cols * level.rows;
  }

  dispose() {
    this.keepLevels([]);
  }
}

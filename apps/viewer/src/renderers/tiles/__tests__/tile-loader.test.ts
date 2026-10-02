import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TileCache, tileId } from "../tile-cache";
import { TileLoader } from "../tile-loader";
import type { TileKey } from "../types";

/* The cache only reads width, height and close(), and ImageBitmap does not
   exist in Node. */
function fakeBitmap(size = 512) {
  return {
    width: size,
    height: size,
    closed: false,
    close() {
      this.closed = true;
    },
  };
}

const MB = 1024 * 1024;
/* Wide enough that nothing evicts, so these cases isolate the counting. */
const ROOMY = 500 * MB;

const SHEET = "A-101";

function key(col: number, level = 3): TileKey {
  return { level, col, row: 0 };
}

function resident(cache: TileCache, k: TileKey, sheetId = SHEET) {
  cache.set(tileId(sheetId, k), fakeBitmap() as unknown as ImageBitmap);
}

function loader(cache: TileCache) {
  return new TileLoader("https://set.example/v1", cache);
}

const noop = () => {};

beforeEach(() => {
  /* Never resolves, so no tile lands part-way through a case and nothing is
     counted by the arrival path. The counting under test is synchronous. */
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/* The property these exist for: hit rate is counted per tile needed, not per
   lookup. The draw loop asks for the same tiles on every animation frame, so
   counting per lookup measured frame rate — a tile arriving over 500 ms of
   network recorded ~30 misses, and the ratio was weighted on both sides. */
describe("TileLoader hit accounting", () => {
  it("counts one miss for a tile asked for on thirty consecutive frames", () => {
    const load = loader(new TileCache(ROOMY, ROOMY));

    for (let frame = 0; frame < 30; frame += 1) {
      load.request(SHEET, [key(0)], noop);
    }

    expect(load.stats().misses).toBe(1);
    expect(load.stats().hits).toBe(0);
  });

  it("counts one hit for a resident tile asked for on thirty frames", () => {
    const cache = new TileCache(ROOMY, ROOMY);
    resident(cache, key(0));
    const load = loader(cache);

    for (let frame = 0; frame < 30; frame += 1) {
      load.request(SHEET, [key(0)], noop);
    }

    expect(load.stats().hits).toBe(1);
    expect(load.stats().misses).toBe(0);
  });

  it("counts a fresh need when a tile leaves the viewport and returns", () => {
    const cache = new TileCache(ROOMY, ROOMY);
    resident(cache, key(0));
    const load = loader(cache);

    // Panned onto it, away, and back.
    load.request(SHEET, [key(0)], noop);
    load.request(SHEET, [key(9)], noop);
    load.request(SHEET, [key(0)], noop);

    expect(load.stats().hits).toBe(2);
    // The tile panned to was never fetched.
    expect(load.stats().misses).toBe(1);
  });

  it("records a revisit of a still-pinned sheet as a hit", () => {
    /* The reading the pinned-vs-encoded decision turns on: returning to a sheet
       whose coarse tiles survived eviction should cost nothing. */
    const cache = new TileCache(ROOMY, ROOMY);
    const coarse = [key(0, 1), key(1, 1)];
    for (const k of coarse) resident(cache, k);
    const load = loader(cache);

    load.request(SHEET, coarse, noop);
    load.request("A-102", [key(0, 1)], noop);
    load.request(SHEET, coarse, noop);

    expect(load.stats().hits).toBe(4);
    expect(load.stats().misses).toBe(1);
  });

  it("reports what it still owes, queued and in flight together", () => {
    const load = loader(new TileCache(ROOMY, ROOMY));

    /* Ten tiles against an in-flight cap of four: six wait in the queue, and a
       count of only the started four would understate the backlog. */
    const keys = Array.from({ length: 10 }, (_, i) => key(i));
    load.request(SHEET, keys, noop);

    expect(load.stats().pending).toBe(10);
  });
});

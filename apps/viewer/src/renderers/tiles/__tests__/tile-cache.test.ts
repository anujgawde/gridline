import { describe, expect, it } from "vitest";

import { TileCache, tileId } from "../tile-cache";

/* A stand-in for a decoded tile. ImageBitmap does not exist in Node, and the
   cache only ever reads width, height and close() — so a fake that records
   whether it was released is enough, and lets the release itself be asserted. */
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
/* A 512x512 tile is 1 MB decoded, so a budget in megabytes is a budget in
   tiles — which makes the eviction arithmetic legible in the tests. */
const ONE_TILE = MB;

function deep(n: number) {
  // Level 2 and above are evictable; levels 0 and 1 are pinned by the cache.
  return tileId("A-101", { level: 2, col: n, row: 0 });
}

describe("tileId", () => {
  it("identifies a tile by sheet, level and position", () => {
    expect(tileId("A-101", { level: 3, col: 4, row: 2 })).toBe("A-101/3/4_2");
  });
});

describe("TileCache", () => {
  it("returns what was put in", () => {
    const cache = new TileCache(10 * ONE_TILE);
    const bitmap = fakeBitmap();
    cache.set(deep(0), bitmap as unknown as ImageBitmap);
    expect(cache.get(deep(0))).toBe(bitmap);
    expect(cache.has(deep(0))).toBe(true);
  });

  it("counts hits and misses", () => {
    const cache = new TileCache(10 * ONE_TILE);
    cache.set(deep(0), fakeBitmap() as unknown as ImageBitmap);
    cache.get(deep(0));
    cache.get(deep(1));
    expect(cache.stats().hits).toBe(1);
    expect(cache.stats().misses).toBe(1);
  });

  it("stays within its byte budget", () => {
    /* The property the whole cache exists for. Without it memory grows exactly
       the way the naive renderer's does, only in smaller pieces. */
    const cache = new TileCache(4 * ONE_TILE);
    for (let i = 0; i < 20; i += 1) {
      cache.set(deep(i), fakeBitmap() as unknown as ImageBitmap);
    }
    expect(cache.stats().bytes).toBeLessThanOrEqual(4 * ONE_TILE);
    expect(cache.stats().evictions).toBeGreaterThan(0);
  });

  it("evicts the least recently used first", () => {
    const cache = new TileCache(3 * ONE_TILE);
    cache.set(deep(0), fakeBitmap() as unknown as ImageBitmap);
    cache.set(deep(1), fakeBitmap() as unknown as ImageBitmap);
    cache.set(deep(2), fakeBitmap() as unknown as ImageBitmap);

    // Touching 0 makes 1 the oldest.
    cache.get(deep(0));
    cache.set(deep(3), fakeBitmap() as unknown as ImageBitmap);

    expect(cache.has(deep(1))).toBe(false);
    expect(cache.has(deep(0))).toBe(true);
  });

  it("releases the pixels of an evicted tile", () => {
    /* An ImageBitmap holds memory outside the JS heap, so dropping the
       reference is not enough — nothing reliably reclaims it in time. */
    const cache = new TileCache(2 * ONE_TILE);
    const first = fakeBitmap();
    cache.set(deep(0), first as unknown as ImageBitmap);
    for (let i = 1; i < 6; i += 1) {
      cache.set(deep(i), fakeBitmap() as unknown as ImageBitmap);
    }
    expect(first.closed).toBe(true);
  });

  it("never evicts the coarse levels", () => {
    /* Levels 0 and 1 are what let any sheet show something immediately. They
       cost a few megabytes across the whole set; evicting them to make room for
       deep-zoom tiles trades the cheapest thing for the most expensive. */
    const cache = new TileCache(2 * ONE_TILE);
    const base = fakeBitmap();
    cache.set(
      tileId("A-101", { level: 0, col: 0, row: 0 }),
      base as unknown as ImageBitmap,
    );

    for (let i = 0; i < 20; i += 1) {
      cache.set(deep(i), fakeBitmap() as unknown as ImageBitmap);
    }

    expect(cache.has(tileId("A-101", { level: 0, col: 0, row: 0 }))).toBe(true);
    expect(base.closed).toBe(false);
  });

  it("does not let a peek count as a use", () => {
    /* The draw loop peeks at coarse levels every frame as a fallback layer.
       If that counted, the tiles being looked at would be evicted first. */
    const cache = new TileCache(3 * ONE_TILE);
    cache.set(deep(0), fakeBitmap() as unknown as ImageBitmap);
    cache.set(deep(1), fakeBitmap() as unknown as ImageBitmap);
    cache.set(deep(2), fakeBitmap() as unknown as ImageBitmap);

    cache.peek(deep(0));
    cache.set(deep(3), fakeBitmap() as unknown as ImageBitmap);

    // 0 was only peeked at, so it is still the oldest and goes first.
    expect(cache.has(deep(0))).toBe(false);
  });

  it("ignores a repeated set rather than double-counting it", () => {
    const cache = new TileCache(10 * ONE_TILE);
    cache.set(deep(0), fakeBitmap() as unknown as ImageBitmap);
    const before = cache.stats().bytes;
    cache.set(deep(0), fakeBitmap() as unknown as ImageBitmap);
    expect(cache.stats().bytes).toBe(before);
    expect(cache.stats().count).toBe(1);
  });

  it("releases everything when cleared", () => {
    const cache = new TileCache(10 * ONE_TILE);
    const bitmaps = [fakeBitmap(), fakeBitmap(), fakeBitmap()];
    bitmaps.forEach((b, i) => cache.set(deep(i), b as unknown as ImageBitmap));

    cache.clear();

    expect(cache.stats().count).toBe(0);
    expect(cache.stats().bytes).toBe(0);
    for (const bitmap of bitmaps) expect(bitmap.closed).toBe(true);
  });
});

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
/* A pinned budget large enough never to bind, so the cases below exercise
   ordinary tile eviction exactly as they did before the pin gained a ceiling.
   The cases that test the ceiling itself set their own. */
const ROOMY_PIN = 100 * 1024 * 1024;
/* A 512x512 tile is 1 MB decoded, so a budget in megabytes is a budget in
   tiles — which makes the eviction arithmetic legible in the tests. */
const ONE_TILE = MB;

function deep(n: number) {
  // Level 2 and above are evictable; levels 0 and 1 are pinned by the cache.
  return tileId("A-101", { level: 2, col: n, row: 0 });
}

/* A pinned tile, on whichever sheet. Level 1 is inside PINNED_THROUGH_LEVEL, so
   these are the entries the pinned budget governs. */
function coarse(sheetId: string, n = 0) {
  return tileId(sheetId, { level: 1, col: n, row: 0 });
}

/* Total budget wide enough that ordinary tile eviction never fires, so these
   cases isolate the pinned ceiling. */
const ROOMY_TOTAL = 100 * ONE_TILE;

describe("tileId", () => {
  it("identifies a tile by sheet, level and position", () => {
    expect(tileId("A-101", { level: 3, col: 4, row: 2 })).toBe("A-101/3/4_2");
  });
});

describe("TileCache", () => {
  it("returns what was put in", () => {
    const cache = new TileCache(10 * ONE_TILE, ROOMY_PIN);
    const bitmap = fakeBitmap();
    cache.set(deep(0), bitmap as unknown as ImageBitmap);
    expect(cache.get(deep(0))).toBe(bitmap);
    expect(cache.has(deep(0))).toBe(true);
  });

  it("counts hits and misses", () => {
    const cache = new TileCache(10 * ONE_TILE, ROOMY_PIN);
    cache.set(deep(0), fakeBitmap() as unknown as ImageBitmap);
    cache.get(deep(0));
    cache.get(deep(1));
    expect(cache.stats().hits).toBe(1);
    expect(cache.stats().misses).toBe(1);
  });

  it("stays within its byte budget", () => {
    /* The property the whole cache exists for. Without it memory grows exactly
       the way the naive renderer's does, only in smaller pieces. */
    const cache = new TileCache(4 * ONE_TILE, ROOMY_PIN);
    for (let i = 0; i < 20; i += 1) {
      cache.set(deep(i), fakeBitmap() as unknown as ImageBitmap);
    }
    expect(cache.stats().bytes).toBeLessThanOrEqual(4 * ONE_TILE);
    expect(cache.stats().evictions).toBeGreaterThan(0);
  });

  it("evicts the least recently used first", () => {
    const cache = new TileCache(3 * ONE_TILE, ROOMY_PIN);
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
    const cache = new TileCache(2 * ONE_TILE, ROOMY_PIN);
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
    const cache = new TileCache(2 * ONE_TILE, ROOMY_PIN);
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
    const cache = new TileCache(3 * ONE_TILE, ROOMY_PIN);
    cache.set(deep(0), fakeBitmap() as unknown as ImageBitmap);
    cache.set(deep(1), fakeBitmap() as unknown as ImageBitmap);
    cache.set(deep(2), fakeBitmap() as unknown as ImageBitmap);

    cache.peek(deep(0));
    cache.set(deep(3), fakeBitmap() as unknown as ImageBitmap);

    // 0 was only peeked at, so it is still the oldest and goes first.
    expect(cache.has(deep(0))).toBe(false);
  });

  it("ignores a repeated set rather than double-counting it", () => {
    const cache = new TileCache(10 * ONE_TILE, ROOMY_PIN);
    cache.set(deep(0), fakeBitmap() as unknown as ImageBitmap);
    const before = cache.stats().bytes;
    cache.set(deep(0), fakeBitmap() as unknown as ImageBitmap);
    expect(cache.stats().bytes).toBe(before);
    expect(cache.stats().count).toBe(1);
  });

  /* The duplicate is dropped, and dropping it has to mean releasing it. Its
     pixels live outside the JS heap, so nothing reclaims them on their own, and
     they are not in #bytes either — so the cache could pass its own budget check
     while holding memory it had forgotten about. */
  it("releases the duplicate it refuses to hold", () => {
    const cache = new TileCache(10 * ONE_TILE, ROOMY_PIN);
    const kept = fakeBitmap();
    const duplicate = fakeBitmap();

    cache.set(deep(0), kept as unknown as ImageBitmap);
    cache.set(deep(0), duplicate as unknown as ImageBitmap);

    expect(duplicate.closed).toBe(true);
    // And the one actually in the cache is still usable.
    expect(kept.closed).toBe(false);
    expect(cache.get(deep(0))).toBe(kept);
  });

  /* The regression this phase exists for. Pinned tiles used to be exempt from the
     budget outright, so they grew 5 MB per sheet visited with eviction never
     running — 700 MB after 140 sheets, measured. The exemption now has an edge. */
  it("bounds the pinned tiles with a budget of their own", () => {
    const cache = new TileCache(ROOMY_TOTAL, 3 * ONE_TILE);
    for (const sheet of ["A-101", "A-102", "A-103"]) {
      cache.set(coarse(sheet), fakeBitmap() as unknown as ImageBitmap);
    }
    expect(cache.stats().pinnedBytes).toBe(3 * ONE_TILE);

    cache.set(coarse("A-104"), fakeBitmap() as unknown as ImageBitmap);

    // The sheet left longest ago goes, and the total stays at the ceiling.
    expect(cache.has(coarse("A-101"))).toBe(false);
    expect(cache.has(coarse("A-104"))).toBe(true);
    expect(cache.stats().pinnedBytes).toBe(3 * ONE_TILE);
    expect(cache.stats().sheets).toBe(3);
  });

  /* Four of a sheet's five coarse tiles paints a sheet with a hole in it, which
     is worse than one that paints late. So the unit of pinned eviction is the
     sheet, not the tile. */
  it("drops pinned tiles a whole sheet at a time", () => {
    const cache = new TileCache(ROOMY_TOTAL, 3 * ONE_TILE);
    const first = fakeBitmap();
    const second = fakeBitmap();
    cache.set(coarse("A-101", 0), first as unknown as ImageBitmap);
    cache.set(coarse("A-101", 1), second as unknown as ImageBitmap);
    cache.set(coarse("A-102"), fakeBitmap() as unknown as ImageBitmap);

    cache.set(coarse("A-103"), fakeBitmap() as unknown as ImageBitmap);

    expect(cache.has(coarse("A-101", 0))).toBe(false);
    expect(cache.has(coarse("A-101", 1))).toBe(false);
    expect(first.closed).toBe(true);
    expect(second.closed).toBe(true);
    expect(cache.stats().pinnedBytes).toBe(2 * ONE_TILE);
  });

  it("drops a sheet's deep tiles along with its coarse ones", () => {
    const cache = new TileCache(ROOMY_TOTAL, ONE_TILE);
    // deep() is on A-101, so this sheet holds one pinned tile and one evictable.
    cache.set(coarse("A-101"), fakeBitmap() as unknown as ImageBitmap);
    cache.set(deep(0), fakeBitmap() as unknown as ImageBitmap);
    cache.set(coarse("A-102"), fakeBitmap() as unknown as ImageBitmap);

    /* A-101 was given up, so keeping its deep tiles would be holding the
       expensive half of a sheet nobody can paint quickly any more. */
    expect(cache.has(deep(0))).toBe(false);
    expect(cache.stats().count).toBe(1);
  });

  it("keeps the sheet being written to, even over budget", () => {
    const cache = new TileCache(ROOMY_TOTAL, ONE_TILE);
    cache.set(coarse("A-101", 0), fakeBitmap() as unknown as ImageBitmap);
    cache.set(coarse("A-101", 1), fakeBitmap() as unknown as ImageBitmap);

    /* Deliberately over the pinned ceiling. The alternative is evicting the
       coarse tiles of the sheet currently being painted, which would blank the
       canvas to satisfy a number. */
    expect(cache.has(coarse("A-101", 0))).toBe(true);
    expect(cache.has(coarse("A-101", 1))).toBe(true);
    expect(cache.stats().pinnedBytes).toBe(2 * ONE_TILE);
  });

  it("counts a revisit as recent use of that sheet", () => {
    const cache = new TileCache(ROOMY_TOTAL, 2 * ONE_TILE);
    cache.set(coarse("A-101"), fakeBitmap() as unknown as ImageBitmap);
    cache.set(coarse("A-102"), fakeBitmap() as unknown as ImageBitmap);

    // Returning to A-101 should move it behind A-102 in the eviction order.
    cache.get(coarse("A-101"));
    cache.set(coarse("A-103"), fakeBitmap() as unknown as ImageBitmap);

    expect(cache.has(coarse("A-101"))).toBe(true);
    expect(cache.has(coarse("A-102"))).toBe(false);
  });

  it("releases everything when cleared", () => {
    const cache = new TileCache(10 * ONE_TILE, ROOMY_PIN);
    const bitmaps = [fakeBitmap(), fakeBitmap(), fakeBitmap()];
    bitmaps.forEach((b, i) => cache.set(deep(i), b as unknown as ImageBitmap));

    cache.clear();

    expect(cache.stats().count).toBe(0);
    expect(cache.stats().bytes).toBe(0);
    for (const bitmap of bitmaps) expect(bitmap.closed).toBe(true);
  });
});

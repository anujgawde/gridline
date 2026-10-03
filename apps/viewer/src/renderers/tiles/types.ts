export interface TileLevel {
  level: number;
  width: number;
  height: number;
  cols: number;
  rows: number;
}

export interface TileIndex {
  sheetId: string;
  title: string;
  discipline: string;
  /* Sheet-space, in points. Cross-MFE coordinates are always sheet-space, and
     this is what screen positions are converted against. */
  pageWidth: number;
  pageHeight: number;
  levels: TileLevel[];
}

export interface TileKey {
  level: number;
  col: number;
  row: number;
}

export interface TileCacheStats {
  /* Decoded bytes held, not file bytes. A 512x512 tile is ~18 KB as WebP and
     1 MB once decoded, and it is the decoded form that occupies memory. */
  bytes: number;
  /* Of those bytes, the ones held by pinned coarse tiles. Reported separately
     because the two are bounded separately, and because a pinned total sitting
     at its ceiling is the signal that revisits are about to start missing. */
  pinnedBytes: number;
  count: number;
  /* Sheets with at least one tile held. The unit pinned eviction works in. */
  sheets: number;
  evictions: number;
}

/* Hit rate belongs to the request stream, not to the store.

   These used to live on the cache, incremented inside `get()`. That made them
   uninterpretable: the draw loop calls `get()` through the loader once per
   animation frame, so one tile arriving over 500 ms of network was recorded as
   ~30 misses, and a tile sitting on screen during a pan accrued hits at the
   refresh rate. The counters measured how long something was looked at, not how
   often it was there — and the ratio was weighted by frame rate on both sides.

   Counted here instead, once per tile per time it enters the set of tiles the
   renderer needs. That is the question the pinned-vs-encoded decision turns on:
   when a tile came into view, was it already in memory? */
export interface TileLoaderStats {
  /* Needed and already resident. */
  hits: number;
  /* Needed and not resident, so a fetch had to be started. */
  misses: number;
  /* Outstanding live requests, queued or in flight. Excludes prefetches, which
     are never what anything is waiting for. */
  pending: number;
  /* Speculative requests outstanding. Reported apart from `pending` because a
     backlog of guesses and a backlog of needs mean opposite things: the first is
     spare capacity being used, the second is someone waiting. */
  prefetchPending: number;
}

/* Everything the tiled renderer can say about itself: both counters plus where
   the view currently is. The two stat types have disjoint keys so this composes
   rather than restating them. */
export type TileStats = TileCacheStats &
  TileLoaderStats & {
    /* The level being drawn, which is what decides how much is fetched. */
    level: number;
    scale: number;
  };

/* Read on demand rather than pushed on every frame.

   A panel handed a value per frame would re-render at the refresh rate, which
   makes displaying the numbers cost more than producing them — the instrument
   changing what it measures, which is the mistake this phase already made once
   with a counter built from the cache it was auditing. Pulling lets the panel
   choose a cadence a person can read.

   Null before a sheet's grid has loaded, because `level` is derived from it.
   Callers show nothing rather than a zero that looks like a measurement. */
export type TileStatsSource = () => TileStats | null;

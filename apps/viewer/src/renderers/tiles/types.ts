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
  hits: number;
  misses: number;
  evictions: number;
}

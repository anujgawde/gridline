import type { TileIndex } from "./schema";

/* One revision of one sheet, at one set address. */
export interface PyramidRef {
  baseUrl: string;
  sheetId: string;
  revision: number;
}

/* A revision ready to draw: where its tiles are, and their grid. */
export interface Pyramid {
  ref: PyramidRef;
  index: TileIndex;
}

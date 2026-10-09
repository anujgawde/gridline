/* A sheet-space rectangle, in points. Unlike the bus's BBox, a zero width or
   height is allowed: a query box can be a single point. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MarkupStoreOptions {
  /* The sheet's page rectangle, in points: the quadtree's root. */
  page: Box;
  /* Injected so tests are deterministic. Default to crypto.randomUUID and
     the wall clock. */
  newId?: () => string;
  now?: () => Date;
}

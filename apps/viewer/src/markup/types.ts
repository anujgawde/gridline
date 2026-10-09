/* A sheet-space rectangle, in points. Unlike the bus's BBox, a zero width or
   height is allowed: a query box can be a single point. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

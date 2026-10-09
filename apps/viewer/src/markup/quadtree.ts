import { intersects } from "./geometry";
import type { Box } from "./types";

/* Starting values, not tuned ones. 5.3 measures hit-testing in a browser and
   is where these get judged. */
const SPLIT_AT = 8;
const MAX_DEPTH = 8;

interface QuadNode {
  box: Box;
  depth: number;
  items: Map<string, Box>;
  children: QuadNode[] | null;
}

/* A region quadtree over bounding boxes. It narrows a query to candidates by
   box only; the exact test belongs to the caller.

   A box that straddles a split stays in the node above it rather than being
   copied into every child it touches. That costs a few extra candidates near
   the split lines, and buys two things: remove is exact, since each id lives
   in one node, and a query never returns the same id twice. A box outside the
   root's bounds stays in the root for the same reason, so a markup dragged
   off the page is still found. */
export class Quadtree {
  readonly #root: QuadNode;
  readonly #owner = new Map<string, QuadNode>();

  constructor(bounds: Box) {
    this.#root = node(bounds, 0);
  }

  get size(): number {
    return this.#owner.size;
  }

  /* Inserting an id already present moves it, so an edit is one call. */
  insert(id: string, box: Box): void {
    this.remove(id);
    let at = this.#root;
    while (at.children) {
      const child = at.children.find((c) => encloses(c.box, box));
      if (!child) break;
      at = child;
    }
    at.items.set(id, box);
    this.#owner.set(id, at);
    if (!at.children && at.items.size > SPLIT_AT && at.depth < MAX_DEPTH) {
      this.#split(at);
    }
  }

  /* Empty nodes are left in place. A sheet holds markups in the thousands,
     not millions, and a node kept costs less than one rebuilt on the next
     stroke in the same area. */
  remove(id: string): boolean {
    const at = this.#owner.get(id);
    if (!at) return false;
    at.items.delete(id);
    this.#owner.delete(id);
    return true;
  }

  query(box: Box): string[] {
    const found: string[] = [];
    const stack = [this.#root];
    while (stack.length > 0) {
      const at = stack.pop()!;
      for (const [id, itemBox] of at.items) {
        if (intersects(itemBox, box)) found.push(id);
      }
      if (!at.children) continue;
      for (const child of at.children) {
        if (intersects(child.box, box)) stack.push(child);
      }
    }
    return found;
  }

  #split(at: QuadNode): void {
    const { x, y, w, h } = at.box;
    const hw = w / 2;
    const hh = h / 2;
    const depth = at.depth + 1;
    at.children = [
      node({ x, y, w: hw, h: hh }, depth),
      node({ x: x + hw, y, w: hw, h: hh }, depth),
      node({ x, y: y + hh, w: hw, h: hh }, depth),
      node({ x: x + hw, y: y + hh, w: hw, h: hh }, depth),
    ];
    for (const [id, box] of at.items) {
      const child = at.children.find((c) => encloses(c.box, box));
      if (!child) continue;
      at.items.delete(id);
      child.items.set(id, box);
      this.#owner.set(id, child);
    }
  }
}

function node(box: Box, depth: number): QuadNode {
  return { box, depth, items: new Map(), children: null };
}

function encloses(outer: Box, inner: Box): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

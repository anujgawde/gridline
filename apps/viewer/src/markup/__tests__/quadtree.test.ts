import { describe, expect, it } from "vitest";

import { intersects } from "../geometry";
import { Quadtree } from "../quadtree";
import type { Box } from "../types";

/* ARCH E1, in points: the sheet size setgen draws. */
const SHEET: Box = { x: 0, y: 0, w: 2160, h: 3024 };

/* mulberry32. Seeded, so a failure reproduces on the next run. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBox(rand: () => number, maxSize: number): Box {
  return {
    x: rand() * SHEET.w,
    y: rand() * SHEET.h,
    w: rand() * maxSize,
    h: rand() * maxSize,
  };
}

function bruteForce(boxes: Map<string, Box>, query: Box): string[] {
  return [...boxes].filter(([, b]) => intersects(b, query)).map(([id]) => id);
}

const sorted = (ids: string[]) => [...ids].sort();

describe("Quadtree", () => {
  const rand = seeded(5_2);
  const boxes = new Map<string, Box>();
  for (let i = 0; i < 5000; i++) boxes.set(`m${i}`, randomBox(rand, 120));

  const queries: Box[] = [
    ...Array.from({ length: 200 }, () => randomBox(rand, 300)),
    /* Points: a tap with no tolerance is a zero-size query. */
    ...Array.from({ length: 200 }, () => ({ ...randomBox(rand, 0), w: 0, h: 0 })),
    SHEET,
  ];

  it("agrees with a brute-force scan over 5,000 boxes", () => {
    const tree = new Quadtree(SHEET);
    for (const [id, b] of boxes) tree.insert(id, b);
    expect(tree.size).toBe(5000);
    for (const q of queries) {
      expect(sorted(tree.query(q))).toEqual(sorted(bruteForce(boxes, q)));
    }
  });

  it("still agrees after half the boxes are removed", () => {
    const tree = new Quadtree(SHEET);
    for (const [id, b] of boxes) tree.insert(id, b);
    const kept = new Map(boxes);
    for (const id of [...boxes.keys()].filter((_, i) => i % 2 === 0)) {
      expect(tree.remove(id)).toBe(true);
      kept.delete(id);
    }
    expect(tree.size).toBe(2500);
    for (const q of queries) {
      expect(sorted(tree.query(q))).toEqual(sorted(bruteForce(kept, q)));
    }
  });

  it("returns a box that straddles split lines exactly once", () => {
    const tree = new Quadtree(SHEET);
    for (const [id, b] of boxes) tree.insert(id, b);
    /* Across the sheet's centre, where the first split runs both ways. */
    tree.insert("straddler", { x: 1000, y: 1400, w: 200, h: 200 });
    const found = tree.query(SHEET);
    expect(found.filter((id) => id === "straddler")).toHaveLength(1);
    expect(new Set(found).size).toBe(found.length);
  });

  it("moves an id when it is inserted again", () => {
    const tree = new Quadtree(SHEET);
    tree.insert("a", { x: 10, y: 10, w: 5, h: 5 });
    tree.insert("a", { x: 2000, y: 3000, w: 5, h: 5 });
    expect(tree.size).toBe(1);
    expect(tree.query({ x: 10, y: 10, w: 0, h: 0 })).toEqual([]);
    expect(tree.query({ x: 2002, y: 3002, w: 0, h: 0 })).toEqual(["a"]);
  });

  it("leaves no trace of a removed id", () => {
    const tree = new Quadtree(SHEET);
    tree.insert("a", { x: 10, y: 10, w: 5, h: 5 });
    expect(tree.remove("a")).toBe(true);
    expect(tree.remove("a")).toBe(false);
    expect(tree.query(SHEET)).toEqual([]);
  });

  it("finds a box that lies partly or wholly off the sheet", () => {
    const tree = new Quadtree(SHEET);
    tree.insert("edge", { x: -50, y: 100, w: 100, h: 10 });
    tree.insert("off", { x: 5000, y: 5000, w: 10, h: 10 });
    expect(tree.query({ x: -20, y: 105, w: 0, h: 0 })).toEqual(["edge"]);
    expect(tree.query({ x: 5005, y: 5005, w: 0, h: 0 })).toEqual(["off"]);
  });

  it("stops splitting at its depth cap when boxes pile on one spot", () => {
    const tree = new Quadtree(SHEET);
    for (let i = 0; i < 100; i++) tree.insert(`p${i}`, { x: 1, y: 1, w: 0, h: 0 });
    expect(tree.query({ x: 1, y: 1, w: 0, h: 0 })).toHaveLength(100);
  });
});

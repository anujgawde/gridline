import { describe, expect, it } from "vitest";

import { bounds, hits, intersects } from "../geometry";
import type { Markup } from "../schema";

const common = {
  id: "0b6c5a3e-6f1d-4c7a-9d2e-3f4a5b6c7d8e",
  sheetId: "A-101",
  revision: 1,
  number: 1,
  colour: "markup-default" as const,
  strokeWidth: 2,
  author: "D. Okafor",
  createdAt: "2026-06-03T14:12:00Z",
};

/* A horizontal stroke from (0, 0) to (100, 0), 2pt wide: its ink reaches 1pt
   either side of the line. */
const ink: Markup = { ...common, kind: "ink", points: [[0, 0], [100, 0]] };
const rect: Markup = { ...common, kind: "rect", x: 10, y: 10, w: 50, h: 20 };
const text: Markup = {
  ...common,
  kind: "text",
  x: 10,
  y: 10,
  w: 50,
  h: 12,
  text: "RFI 042",
  size: 10,
};

describe("bounds", () => {
  it("covers every ink point, grown by half the stroke", () => {
    expect(bounds(ink)).toEqual({ x: -1, y: -1, w: 102, h: 2 });
  });

  it("grows a rect by half the stroke", () => {
    expect(bounds(rect)).toEqual({ x: 9, y: 9, w: 52, h: 22 });
  });

  it("leaves text at its measured extent", () => {
    expect(bounds(text)).toEqual({ x: 10, y: 10, w: 50, h: 12 });
  });
});

describe("hits", () => {
  it("hits ink on the line, and at the edge of tolerance plus half the stroke", () => {
    expect(hits(ink, [50, 0], 0)).toBe(true);
    expect(hits(ink, [50, 4], 3)).toBe(true);
    expect(hits(ink, [50, 4.01], 3)).toBe(false);
  });

  it("measures past an ink end to the end point, not the infinite line", () => {
    expect(hits(ink, [103, 0], 2)).toBe(true);
    expect(hits(ink, [104, 1], 2)).toBe(false);
  });

  it("widens the ink hit band with a thicker stroke", () => {
    const thick: Markup = { ...ink, strokeWidth: 10 };
    expect(hits(ink, [50, 5], 0)).toBe(false);
    expect(hits(thick, [50, 5], 0)).toBe(true);
  });

  it("handles a zero-length ink segment as a point", () => {
    const dot: Markup = { ...ink, points: [[5, 5], [5, 5]] };
    expect(hits(dot, [6, 5], 0)).toBe(true);
    expect(hits(dot, [7, 5], 0)).toBe(false);
  });

  it("hits a rect inside as well as on its outline", () => {
    expect(hits(rect, [35, 20], 0)).toBe(true);
    expect(hits(rect, [8, 20], 1)).toBe(true);
    expect(hits(rect, [7.9, 20], 1)).toBe(false);
  });

  it("hits text within its box plus tolerance, with no stroke allowance", () => {
    expect(hits(text, [9, 15], 1)).toBe(true);
    expect(hits(text, [8.9, 15], 1)).toBe(false);
  });
});

describe("intersects", () => {
  it("counts touching edges and a zero-size box", () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    expect(intersects(a, { x: 10, y: 10, w: 5, h: 5 })).toBe(true);
    expect(intersects(a, { x: 5, y: 5, w: 0, h: 0 })).toBe(true);
    expect(intersects(a, { x: 10.1, y: 0, w: 5, h: 5 })).toBe(false);
  });
});

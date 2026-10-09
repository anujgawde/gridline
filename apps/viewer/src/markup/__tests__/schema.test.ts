import { describe, expect, it } from "vitest";

import { Markup } from "../schema";

const common = {
  id: "0b6c5a3e-6f1d-4c7a-9d2e-3f4a5b6c7d8e",
  sheetId: "A-101",
  revision: 1,
  number: 1,
  colour: "markup-default",
  strokeWidth: 2,
  author: "D. Okafor",
  createdAt: "2026-06-03T14:12:00Z",
};

const valid = {
  ink: { ...common, kind: "ink", points: [[0, 0], [10, 10]] },
  rect: { ...common, kind: "rect", x: 0, y: 0, w: 10, h: 5 },
  cloud: { ...common, kind: "cloud", x: 0, y: 0, w: 10, h: 5, note: "Head height" },
  text: { ...common, kind: "text", x: 0, y: 0, w: 40, h: 12, text: "RFI 042", size: 10 },
};

describe("Markup schema", () => {
  it.each(Object.entries(valid))("accepts a valid %s and returns it unchanged", (_, m) => {
    expect(Markup.parse(m)).toEqual(m);
  });

  it("rejects ink with a single point", () => {
    expect(Markup.safeParse({ ...valid.ink, points: [[0, 0]] }).success).toBe(false);
  });

  it.each([0, -5])("rejects a box with width %d", (w) => {
    expect(Markup.safeParse({ ...valid.rect, w }).success).toBe(false);
  });

  it("rejects an unknown kind", () => {
    expect(Markup.safeParse({ ...valid.rect, kind: "measure" }).success).toBe(false);
  });

  it("rejects a raw colour value, accepting only token names", () => {
    expect(Markup.safeParse({ ...valid.rect, colour: "#e5484d" }).success).toBe(false);
  });

  it("rejects an id that is not a UUID", () => {
    expect(Markup.safeParse({ ...valid.rect, id: "3" }).success).toBe(false);
  });
});

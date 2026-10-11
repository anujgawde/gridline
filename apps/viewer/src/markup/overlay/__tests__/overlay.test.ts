import { describe, expect, it } from "vitest";

import { Markup } from "../../schema";
import { visibleBox } from "../paint";
import { seededMarkups } from "../seed";
import { MarkupStores } from "../stores";
import { markupSeedCount } from "../switches";

const PAGE = { x: 0, y: 0, w: 2160, h: 3024 };

describe("seededMarkups", () => {
  it("is the same set on every run", () => {
    expect(seededMarkups("A-101", 1, PAGE, 50)).toEqual(seededMarkups("A-101", 1, PAGE, 50));
  });

  it("produces only valid markups, mostly ink", () => {
    const set = seededMarkups("A-101", 1, PAGE, 2000);
    expect(set).toHaveLength(2000);
    for (const m of set) expect(() => Markup.parse(m)).not.toThrow();
    const ink = set.filter((m) => m.kind === "ink").length / set.length;
    expect(ink).toBeGreaterThan(0.6);
    expect(new Set(set.map((m) => m.kind))).toEqual(new Set(["ink", "rect", "cloud", "text"]));
  });
});

describe("MarkupStores", () => {
  it("keeps one store per sheet and revision", () => {
    const stores = new MarkupStores();
    const a = stores.get("A-101", 1, PAGE);
    expect(stores.get("A-101", 1, PAGE)).toBe(a);
    expect(stores.get("A-101", 2, PAGE)).not.toBe(a);
    expect(stores.get("A-102", 1, PAGE)).not.toBe(a);
  });

  it("seeds a new store when asked to", () => {
    expect(new MarkupStores(300).get("A-101", 1, PAGE).markups).toHaveLength(300);
    expect(new MarkupStores().get("A-101", 1, PAGE).markups).toHaveLength(0);
  });
});

describe("markupSeedCount", () => {
  it.each([
    ["?markups=5000", 5000],
    ["?markups=999999", 20000],
    ["?markups=0", 0],
    ["?markups=-3", 0],
    ["?markups=1.5", 0],
    ["?markups=lots", 0],
    ["", 0],
  ])("reads %s as %d", (search, expected) => {
    expect(markupSeedCount(search)).toBe(expected);
  });
});

describe("visibleBox", () => {
  it("inverts the view: the canvas corners in sheet points", () => {
    const frame = {
      sheetId: "A-101",
      revision: 1,
      view: { x: -200, y: 100, scale: 0.5 },
      width: 800,
      height: 600,
      pageWidth: 2160,
      pageHeight: 3024,
    };
    expect(visibleBox(frame)).toEqual({ x: 400, y: -200, w: 1600, h: 1200 });
  });
});

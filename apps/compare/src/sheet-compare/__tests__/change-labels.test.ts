import { describe, expect, it } from "vitest";

import { kindCounts, placeOf } from "../change-labels";

const page = { width: 300, height: 300 };
const at = (x: number, y: number) => ({ x: x - 5, y: y - 5, width: 10, height: 10 });

describe("placeOf", () => {
  it.each([
    [50, 50, "Upper left"],
    [150, 50, "Upper centre"],
    [250, 250, "Lower right"],
    [50, 150, "Middle left"],
    [150, 150, "Centre"],
  ])("reads a change centred at %i, %i as %s", (x, y, place) => {
    expect(placeOf(at(x, y), page)).toBe(place);
  });

  it("keeps a change on the page's far edge in the last third", () => {
    expect(placeOf({ x: 290, y: 290, width: 10, height: 10 }, page)).toBe("Lower right");
  });
});

describe("kindCounts", () => {
  it("counts each kind, modified first, leaving out kinds with none", () => {
    const rect = at(0, 0);
    const regions = [
      { id: 1, kind: "added" as const, rect },
      { id: 2, kind: "modified" as const, rect },
      { id: 3, kind: "added" as const, rect },
    ];
    expect(kindCounts(regions)).toEqual([
      { kind: "modified", count: 1 },
      { kind: "added", count: 2 },
    ]);
  });
});

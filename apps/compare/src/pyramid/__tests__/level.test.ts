import { describe, expect, it } from "vitest";

import { pickLevel } from "../level";

const level = (n: number) => {
  const width = 512 * 2 ** n;
  return { level: n, width, height: width, cols: 2 ** n, rows: 2 ** n };
};
// Deliberately out of order: the pick must not depend on how they arrive.
const levels = [level(2), level(0), level(3), level(1)];
const PAGE = 3024;

describe("pickLevel", () => {
  it("takes the coarsest level that is not upscaled", () => {
    // 1,500 device pixels across the page: level 2 (2,048) is the first wide enough.
    expect(pickLevel(levels, PAGE, 1500 / PAGE).level).toBe(2);
  });

  it("takes level 0 when the page is small on screen", () => {
    expect(pickLevel(levels, PAGE, 300 / PAGE).level).toBe(0);
  });

  it("treats an exact match as enough", () => {
    expect(pickLevel(levels, PAGE, 1024 / PAGE).level).toBe(1);
  });

  it("falls back to the deepest level past the pyramid", () => {
    expect(pickLevel(levels, PAGE, 3).level).toBe(3);
  });
});

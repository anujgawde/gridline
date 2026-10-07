import { describe, expect, it } from "vitest";

import { detectLevelOverride, detectOnMainThread } from "../switches";

describe("detectOnMainThread", () => {
  it.each([
    ["", false],
    ["?detect=main", true],
    ["?detect=worker", false],
    ["?sheet=A-131&detect=main", true],
  ])("%s → %s", (search, expected) => {
    expect(detectOnMainThread(search)).toBe(expected);
  });
});

describe("detectLevelOverride", () => {
  it.each([
    ["", null],
    ["?detectLevel=3", 3],
    ["?detectLevel=0", null],
    ["?detectLevel=2.5", null],
    ["?detectLevel=deep", null],
  ])("%s → %s", (search, expected) => {
    expect(detectLevelOverride(search)).toBe(expected);
  });
});

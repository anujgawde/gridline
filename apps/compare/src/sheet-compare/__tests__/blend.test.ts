import { describe, expect, it } from "vitest";

import { blendLabel, blendOpacities } from "../blend";

describe("blendOpacities", () => {
  it.each([
    [0, 1, 0],
    [25, 1, 0.5],
    [50, 1, 1],
    [75, 0.5, 1],
    [100, 0, 1],
  ])("at %i draws FROM at %f and TO at %f", (blend, from, to) => {
    expect(blendOpacities(blend)).toEqual({ from, to });
  });
});

describe("blendLabel", () => {
  it.each([
    [0, "REV 1 100%"],
    [25, "REV 1 50%"],
    [50, "both"],
    [75, "REV 3 50%"],
    [100, "REV 3 100%"],
  ])("at %i reads %s", (blend, label) => {
    expect(blendLabel(blend, 1, 3)).toBe(label);
  });
});

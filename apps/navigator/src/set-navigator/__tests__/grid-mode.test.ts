import { describe, expect, it } from "vitest";

import { gridMode, thumbnailsEnabled } from "../grid-mode";

describe("gridMode", () => {
  it("is virtual by default", () => {
    expect(gridMode("")).toBe("virtual");
    expect(gridMode("?view=sheets")).toBe("virtual");
  });

  it("is full only when asked for exactly", () => {
    expect(gridMode("?view=sheets&grid=full")).toBe("full");
    expect(gridMode("?grid=FULL")).toBe("virtual");
    expect(gridMode("?grid=")).toBe("virtual");
  });
});

describe("thumbnailsEnabled", () => {
  it("is on unless switched off with exactly 0", () => {
    expect(thumbnailsEnabled("")).toBe(true);
    expect(thumbnailsEnabled("?view=sheets&thumbs=0")).toBe(false);
    expect(thumbnailsEnabled("?thumbs=1")).toBe(true);
    expect(thumbnailsEnabled("?thumbs=no")).toBe(true);
  });
});

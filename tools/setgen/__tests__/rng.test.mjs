import { describe, expect, it } from "vitest";

import { hashString, mulberry32, rngForSheet } from "../rng.mjs";

describe("mulberry32", () => {
  it("returns the same sequence for the same seed", () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const first = Array.from({ length: 10 }, () => a());
    const second = Array.from({ length: 10 }, () => b());
    expect(first).toEqual(second);
  });

  it("returns a different sequence for a different seed", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });

  it("stays inside [0, 1)", () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 1000; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("hashString", () => {
  it("is stable for the same input", () => {
    expect(hashString("A-101")).toBe(hashString("A-101"));
  });

  it("separates sheet ids that differ by one character", () => {
    expect(hashString("A-101")).not.toBe(hashString("A-102"));
  });
});

describe("rngForSheet", () => {
  it("depends on the sheet, not on generation order", () => {
    // The reason a per-sheet generator exists: asking for A-203 on its own has
    // to give what the full run gives, or partial regeneration changes bytes.
    const alone = rngForSheet("v1", "A-203");
    const afterOthers = (() => {
      rngForSheet("v1", "A-101")();
      rngForSheet("v1", "A-102")();
      return rngForSheet("v1", "A-203");
    })();
    expect(alone()).toBe(afterOthers());
  });

  it("changes with the run seed", () => {
    expect(rngForSheet("v1", "A-101")()).not.toBe(rngForSheet("v2", "A-101")());
  });
});

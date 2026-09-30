import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { renderSheet } from "../render.mjs";
import { buildSheetList } from "../sheets.mjs";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

describe("renderSheet", () => {
  it("produces a PDF", async () => {
    const [sheet] = buildSheetList(1);
    const bytes = await renderSheet(sheet, "test");
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("produces identical bytes for the same sheet and seed", async () => {
    // The property every performance number depends on. If this fails, two runs
    // are measuring two different documents and nothing taken against them can
    // be compared. It also guards the timestamps: pdf-lib fills them from the
    // clock unless they are pinned, and that alone would break byte equality.
    const [sheet] = buildSheetList(1);
    const first = await renderSheet(sheet, "test");
    const second = await renderSheet(sheet, "test");
    expect(digest(second)).toBe(digest(first));
  });

  it("produces different bytes for a different seed", async () => {
    const [sheet] = buildSheetList(1);
    const a = await renderSheet(sheet, "seed-a");
    const b = await renderSheet(sheet, "seed-b");
    expect(digest(b)).not.toBe(digest(a));
  });

  it("renders a sheet the same alone as it does inside a larger set", async () => {
    // What per-sheet seeding buys: regenerating one sheet cannot change it.
    const fromSmall = buildSheetList(4).find((s) => s.sheetId === "A-201");
    const fromLarge = buildSheetList(1500).find((s) => s.sheetId === "A-201");
    expect(fromLarge).toEqual(fromSmall);
    const a = await renderSheet(fromSmall, "gridline-v1");
    const b = await renderSheet(fromLarge, "gridline-v1");
    expect(digest(b)).toBe(digest(a));
  });

  it("carries enough geometry to be worth rasterizing", async () => {
    // A guard on density rather than a precise size: a sheet that collapsed to a
    // border and a title block would still pass every other test here while
    // making the rendering budgets meaningless. The floor sits below the
    // smallest sheet in the 1,500-sheet set (12.6 KB) and well above what a
    // border and title block alone would weigh.
    const [sheet] = buildSheetList(1);
    const bytes = await renderSheet(sheet, "test");
    expect(bytes.length).toBeGreaterThan(10_000);
  });
});

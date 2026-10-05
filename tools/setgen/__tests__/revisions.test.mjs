import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { renderSheet } from "../render.mjs";
import {
  EDIT_KINDS,
  latestRevision,
  revisionEdits,
  sheetFile,
} from "../revisions.mjs";
import { DISCIPLINES, buildSheetList } from "../sheets.mjs";

const SEED = "gridline-v1";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

const set = buildSheetList(1500);
const revised = set.filter((s) => latestRevision(SEED, s.sheetId) > 1);

describe("latestRevision", () => {
  it("leaves most of the set at revision 1", () => {
    // A superseded sheet is the exception in a real index. If most of the set
    // were reissued, a badge marking it would carry no information.
    expect(revised.length).toBeGreaterThan(30);
    expect(revised.length).toBeLessThan(100);
  });

  it("gives every discipline at least two reissued sheets", () => {
    for (const { code } of DISCIPLINES) {
      const count = revised.filter((s) => s.discipline === code).length;
      expect(count, code).toBeGreaterThanOrEqual(2);
    }
  });

  it("reissues some sheets twice", () => {
    const twice = revised.filter((s) => latestRevision(SEED, s.sheetId) === 3);
    expect(twice.length).toBeGreaterThan(0);
  });

  it("depends on the sheet, not on the size of the set", () => {
    const small = buildSheetList(24).map((s) => latestRevision(SEED, s.sheetId));
    const large = set.slice(0, 24).map((s) => latestRevision(SEED, s.sheetId));
    expect(large).toEqual(small);
  });
});

describe("revisionEdits", () => {
  it("gives revision 1 no edits", () => {
    expect(revisionEdits(SEED, "A-101", 1)).toEqual([]);
  });

  it("is cumulative: a later revision keeps every earlier edit", () => {
    // What lets a 2 -> 3 diff find only what revision 3 changed.
    const second = revisionEdits(SEED, "A-101", 2);
    const third = revisionEdits(SEED, "A-101", 3);
    expect(third.slice(0, second.length)).toEqual(second);
    expect(third.length).toBeGreaterThan(second.length);
  });

  it("keeps each revision's edits few, so a change stays localized", () => {
    for (const sheet of revised) {
      const edits = revisionEdits(SEED, sheet.sheetId, 2);
      expect(edits.length).toBeGreaterThanOrEqual(1);
      expect(edits.length).toBeLessThanOrEqual(3);
      for (const edit of edits) expect(EDIT_KINDS).toContain(edit.kind);
    }
  });
});

describe("sheetFile", () => {
  it("keeps revision 1 at the path the set has always used", () => {
    expect(sheetFile("A-101", 1)).toBe("sheets/A-101.pdf");
    expect(sheetFile("A-101", 2)).toBe("sheets/A-101.r2.pdf");
  });
});

describe("rendering a revision", () => {
  const [sheet] = revised;

  it("produces different bytes from revision 1", async () => {
    const first = await renderSheet({ ...sheet, revision: 1 }, SEED);
    const second = await renderSheet({ ...sheet, revision: 2 }, SEED);
    expect(digest(second)).not.toBe(digest(first));
  });

  it("produces identical bytes for the same revision", async () => {
    const a = await renderSheet({ ...sheet, revision: 2 }, SEED);
    const b = await renderSheet({ ...sheet, revision: 2 }, SEED);
    expect(digest(b)).toBe(digest(a));
  });
});

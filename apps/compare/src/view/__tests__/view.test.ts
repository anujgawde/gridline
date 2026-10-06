import { describe, expect, it } from "vitest";

import { fit, fitRect, panBy, visibleRect, zoomAt, zoomAtCentre, zoomPercent } from "../view";

const page = { width: 3024, height: 2160 };
const pane = { width: 800, height: 600 };

describe("fit", () => {
  it("shows the whole page, centred", () => {
    const view = fit(page, pane);
    const seen = visibleRect(view, pane);
    expect(seen.width).toBeGreaterThanOrEqual(page.width);
    expect(seen.height).toBeGreaterThanOrEqual(page.height);
    expect(seen.x + seen.width / 2).toBeCloseTo(page.width / 2);
    expect(seen.y + seen.height / 2).toBeCloseTo(page.height / 2);
  });
});

describe("zoomAt", () => {
  it("keeps the sheet point under the cursor still", () => {
    const view = fit(page, pane);
    const at = { x: 230, y: 410 };
    const before = { x: view.x + at.x / view.scale, y: view.y + at.y / view.scale };
    const zoomed = zoomAt(view, 3, at.x, at.y);
    expect(zoomed.scale).toBeCloseTo(view.scale * 3);
    expect(zoomed.x + at.x / zoomed.scale).toBeCloseTo(before.x);
    expect(zoomed.y + at.y / zoomed.scale).toBeCloseTo(before.y);
  });

  it("stops at its limits rather than inverting or vanishing", () => {
    const view = fit(page, pane);
    expect(zoomAt(view, 1e6, 0, 0).scale).toBe(8);
    expect(zoomAt(view, 1e-6, 0, 0).scale).toBe(0.02);
  });
});

describe("zoomAtCentre", () => {
  it("keeps the middle of the pane still", () => {
    const view = fit(page, pane);
    const middle = (v: typeof view) => ({
      x: v.x + pane.width / 2 / v.scale,
      y: v.y + pane.height / 2 / v.scale,
    });
    const zoomed = zoomAtCentre(view, 2, pane);
    expect(middle(zoomed).x).toBeCloseTo(middle(view).x);
    expect(middle(zoomed).y).toBeCloseTo(middle(view).y);
  });
});

describe("zoomPercent", () => {
  it("reads one sheet point per pixel as 100%", () => {
    expect(zoomPercent({ x: 0, y: 0, scale: 1 })).toBe("100%");
    expect(zoomPercent({ x: 0, y: 0, scale: 0.7444 })).toBe("74%");
  });
});

describe("panBy", () => {
  it("moves the sheet with the pointer", () => {
    const view = { x: 100, y: 100, scale: 2 };
    expect(panBy(view, 40, -20)).toEqual({ x: 80, y: 110, scale: 2 });
  });
});

describe("fitRect", () => {
  it("centres the rectangle with room around it", () => {
    const rect = { x: 1200, y: 900, width: 400, height: 150 };
    const view = fitRect(rect, pane);
    const seen = visibleRect(view, pane);
    expect(seen.x + seen.width / 2).toBeCloseTo(rect.x + rect.width / 2);
    expect(seen.y + seen.height / 2).toBeCloseTo(rect.y + rect.height / 2);
    expect(seen.width).toBeCloseTo(rect.width * 2);
  });

  it("stops at 200% for a small change", () => {
    expect(fitRect({ x: 10, y: 10, width: 4, height: 4 }, pane).scale).toBe(2);
  });
});

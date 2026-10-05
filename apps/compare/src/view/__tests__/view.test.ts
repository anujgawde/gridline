import { describe, expect, it } from "vitest";

import { fit, panBy, visibleRect, zoomAt } from "../view";

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

describe("panBy", () => {
  it("moves the sheet with the pointer", () => {
    const view = { x: 100, y: 100, scale: 2 };
    expect(panBy(view, 40, -20)).toEqual({ x: 80, y: 110, scale: 2 });
  });
});

import { describe, expect, it } from "vitest";

import { movePane, relock } from "../pane-views";

const a = { x: 0, y: 0, scale: 1 };
const b = { x: 50, y: 20, scale: 2 };

describe("movePane", () => {
  it("moves both panes when locked", () => {
    expect(movePane({ from: a, to: a }, "from", b, true)).toEqual({ from: b, to: b });
  });

  it("moves only the pane that moved when unlocked", () => {
    expect(movePane({ from: a, to: a }, "to", b, false)).toEqual({ from: a, to: b });
  });
});

describe("relock", () => {
  it("brings the other pane to the one moved last", () => {
    expect(relock({ from: a, to: b }, "to")).toEqual({ from: b, to: b });
    expect(relock({ from: a, to: b }, "from")).toEqual({ from: a, to: a });
  });
});

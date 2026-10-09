import { describe, expect, it, vi } from "vitest";

import type { MarkupDraft } from "../schema";
import { HISTORY_LIMIT, MarkupStore } from "../store";

const PAGE = { x: 0, y: 0, w: 2160, h: 3024 };

function makeStore(): MarkupStore {
  let n = 0;
  return new MarkupStore("A-101", {
    page: PAGE,
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    now: () => new Date("2026-06-03T14:12:00Z"),
  });
}

const base = {
  revision: 1,
  colour: "markup-default" as const,
  strokeWidth: 2,
  author: "D. Okafor",
};

const rect = (x: number, y: number, w = 50, h = 20): MarkupDraft => ({
  ...base,
  kind: "rect",
  x,
  y,
  w,
  h,
});

/* The index has to agree with the map after every step: a shape that is in
   one and not the other is the failure this store exists to prevent. */
function expectIndexed(store: MarkupStore): void {
  for (const m of store.markups) {
    const [x, y] = m.kind === "ink" ? m.points[0]! : [m.x + 1, m.y + 1];
    expect(store.hitTest([x, y], 0)?.id).toBe(m.id);
  }
}

describe("MarkupStore", () => {
  it("assigns id, number, sheet and timestamp to a draft", () => {
    const store = makeStore();
    const m = store.add(rect(10, 10));
    expect(m).toMatchObject({
      id: "00000000-0000-4000-8000-000000000001",
      number: 1,
      sheetId: "A-101",
      createdAt: "2026-06-03T14:12:00.000Z",
    });
    expect(store.get(m.id)).toBe(m);
  });

  it("rejects an invalid draft and leaves nothing behind", () => {
    const store = makeStore();
    expect(() => store.add(rect(0, 0, 0, 10))).toThrow();
    expect(store.markups).toEqual([]);
    expect(store.canUndo).toBe(false);
  });

  it("round-trips add, undo and redo, with the index in step", () => {
    const store = makeStore();
    const m = store.add(rect(10, 10));
    expectIndexed(store);
    expect(store.undo()).toBe(true);
    expect(store.markups).toEqual([]);
    expect(store.hitTest([20, 20], 0)).toBeNull();
    expect(store.redo()).toBe(true);
    expect(store.markups).toEqual([m]);
    expectIndexed(store);
  });

  it("restores an undone delete with its id, number and depth", () => {
    const store = makeStore();
    const under = store.add(rect(10, 10));
    store.add(rect(20, 20));
    store.remove(under.id);
    store.undo();
    expect(store.markups.map((m) => m.number)).toEqual([1, 2]);
    expect(store.get(under.id)).toEqual(under);
    /* Overlap at (30, 25): the second rect is still on top. */
    expect(store.hitTest([30, 25], 0)?.number).toBe(2);
  });

  it("moves a shape on update, and undo moves it back", () => {
    const store = makeStore();
    const m = store.add(rect(10, 10));
    const moved = store.update(m.id, { x: 1000, y: 1000 });
    expect(moved).toMatchObject({ id: m.id, number: 1, x: 1000 });
    expect(store.hitTest([20, 20], 0)).toBeNull();
    expect(store.hitTest([1010, 1010], 0)?.id).toBe(m.id);
    store.undo();
    expect(store.hitTest([1010, 1010], 0)).toBeNull();
    expect(store.get(m.id)).toEqual(m);
    expectIndexed(store);
  });

  it("keeps identity fixed on update, whatever the patch says", () => {
    const store = makeStore();
    const m = store.add(rect(10, 10));
    const patch = { number: 99, id: "x" } as unknown as { x: number };
    expect(store.update(m.id, patch)).toMatchObject({ id: m.id, number: 1 });
  });

  it("rejects an invalid update and records nothing", () => {
    const store = makeStore();
    const m = store.add(rect(10, 10));
    expect(() => store.update(m.id, { w: -1 })).toThrow();
    expect(store.get(m.id)).toEqual(m);
    store.undo();
    expect(store.canUndo).toBe(false);
  });

  it("clears redo when a new edit is made", () => {
    const store = makeStore();
    store.add(rect(10, 10));
    store.undo();
    expect(store.canRedo).toBe(true);
    store.add(rect(100, 100));
    expect(store.canRedo).toBe(false);
    expect(store.redo()).toBe(false);
  });

  it("never reuses a number, even one freed by undo", () => {
    const store = makeStore();
    store.add(rect(10, 10));
    store.undo();
    expect(store.add(rect(10, 10)).number).toBe(2);
  });

  it("drops the oldest entry past the history limit", () => {
    const store = makeStore();
    for (let i = 0; i <= HISTORY_LIMIT; i++) store.add(rect(i, 0, 1, 1));
    let undone = 0;
    while (store.undo()) undone++;
    expect(undone).toBe(HISTORY_LIMIT);
    /* The first add fell off the stack, so it can no longer be undone. */
    expect(store.markups.map((m) => m.number)).toEqual([1]);
  });

  it("returns the topmost of overlapping shapes, and null on empty sheet", () => {
    const store = makeStore();
    expect(store.hitTest([20, 20], 0)).toBeNull();
    store.add(rect(10, 10));
    const top = store.add(rect(15, 15));
    expect(store.hitTest([20, 20], 0)?.id).toBe(top.id);
  });

  it("finds ink within tolerance through the index", () => {
    const store = makeStore();
    const line = store.add({ ...base, kind: "ink", points: [[100, 100], [300, 100]] });
    expect(store.hitTest([200, 105], 4)?.id).toBe(line.id);
    expect(store.hitTest([200, 106], 4)).toBeNull();
  });

  it("notifies once per change and keeps the snapshot stable between them", () => {
    const store = makeStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const before = store.markups;
    expect(store.markups).toBe(before);
    const m = store.add(rect(10, 10));
    store.update(m.id, { x: 20 });
    store.undo();
    store.redo();
    store.remove(m.id);
    expect(listener).toHaveBeenCalledTimes(5);
    expect(store.markups).not.toBe(before);
    /* Calls that change nothing notify nobody. */
    store.remove(m.id);
    store.update("missing", { x: 1 });
    store.redo();
    expect(listener).toHaveBeenCalledTimes(5);
    unsubscribe();
    store.undo();
    expect(listener).toHaveBeenCalledTimes(5);
  });
});

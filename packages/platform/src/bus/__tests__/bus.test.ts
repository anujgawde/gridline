import { describe, expect, it, vi } from "vitest";
import { createBus, eventNames, type BusProblem } from "../index.js";
import type { GridlineEventName, GridlineEvents } from "../index.js";

const validPayloads: { [K in GridlineEventName]: GridlineEvents[K] } = {
  "sheet:open": { sheetId: "A-101", revision: 3, source: "navigator" },
  "sheet:loaded": { sheetId: "A-101", revision: 3, pageCount: 1 },
  "sheet:error": { sheetId: "A-101", code: "not-found" },
  "viewport:changed": { sheetId: "A-101", x: 120, y: -40, scale: 2.5 },
  "viewport:focus-region": {
    sheetId: "A-101",
    bbox: { x: 10, y: 10, w: 200, h: 120 },
    animate: true,
  },
  "compare:request": { sheetId: "A-101", from: 2, to: 3 },
  "compare:closed": { sheetId: "A-101" },
};

const collect = () => {
  const problems: BusProblem[] = [];
  return { problems, onProblem: (p: BusProblem) => problems.push(p) };
};

describe("contracts", () => {
  it("covers every event with a valid payload fixture", () => {
    expect(Object.keys(validPayloads).sort()).toEqual([...eventNames].sort());
  });

  it.each(eventNames)("delivers %s to a subscriber unchanged", (event) => {
    const { problems, onProblem } = collect();
    const bus = createBus({ onProblem });
    const handler = vi.fn();

    bus.subscribe(event, handler);
    const published = bus.publish(event, validPayloads[event]);

    expect(published).toBe(true);
    expect(handler).toHaveBeenCalledWith(validPayloads[event]);
    expect(problems).toEqual([]);
  });
});

describe("publish validation", () => {
  it("drops a malformed payload and never reaches a subscriber", () => {
    const { problems, onProblem } = collect();
    const bus = createBus({ onProblem });
    const handler = vi.fn();

    bus.subscribe("sheet:loaded", handler);
    const published = bus.publish("sheet:loaded", {
      sheetId: "A-101",
      revision: 3,
      pageCount: 0, // must be positive
    });

    expect(published).toBe(false);
    expect(handler).not.toHaveBeenCalled();
    expect(problems[0]?.kind).toBe("invalid-publish");
  });

  it("rejects an empty sheetId", () => {
    const bus = createBus({ onProblem: () => {} });
    expect(bus.publish("compare:closed", { sheetId: "" })).toBe(false);
  });

  it("rejects a screen-space-looking bbox with zero extent", () => {
    const bus = createBus({ onProblem: () => {} });
    expect(
      bus.publish("viewport:focus-region", {
        sheetId: "A-101",
        bbox: { x: 0, y: 0, w: 0, h: 0 },
        animate: false,
      }),
    ).toBe(false);
  });

  it("rejects an unknown mfe id as the source", () => {
    const bus = createBus({ onProblem: () => {} });
    expect(
      bus.publish("sheet:open", {
        sheetId: "A-101",
        // @ts-expect-error -- markup is a module inside viewer, not an MFE
        source: "markup",
      }),
    ).toBe(false);
  });
});

describe("receive validation", () => {
  it("gives each subscriber its own copy, so a mutating handler cannot corrupt the next", () => {
    const { problems, onProblem } = collect();
    const bus = createBus({ onProblem });
    const second = vi.fn();

    bus.subscribe("viewport:changed", (payload) => {
      // @ts-expect-error -- deliberately violating the contract at runtime
      payload.scale = -1;
    });
    bus.subscribe("viewport:changed", second);

    bus.publish("viewport:changed", validPayloads["viewport:changed"]);

    expect(second).toHaveBeenCalledWith(validPayloads["viewport:changed"]);
    expect(problems).toEqual([]);
  });

  it("does not hand the publisher's own object to subscribers", () => {
    const bus = createBus({ onProblem: () => {} });
    const payload = { ...validPayloads["compare:closed"] };
    let received: unknown;

    bus.subscribe("compare:closed", (p) => {
      received = p;
    });
    bus.publish("compare:closed", payload);

    expect(received).toEqual(payload);
    expect(received).not.toBe(payload);
  });
});

describe("subscriber isolation", () => {
  it("still delivers to later subscribers when one throws", () => {
    const { problems, onProblem } = collect();
    const bus = createBus({ onProblem });
    const after = vi.fn();

    bus.subscribe("compare:closed", () => {
      throw new Error("remote blew up");
    });
    bus.subscribe("compare:closed", after);

    expect(bus.publish("compare:closed", { sheetId: "A-101" })).toBe(true);
    expect(after).toHaveBeenCalledOnce();
    expect(problems[0]?.kind).toBe("handler-threw");
  });

  it("stops delivery after unsubscribe", () => {
    const bus = createBus({ onProblem: () => {} });
    const handler = vi.fn();

    const unsubscribe = bus.subscribe("compare:closed", handler);
    bus.publish("compare:closed", { sheetId: "A-101" });
    unsubscribe();
    bus.publish("compare:closed", { sheetId: "A-102" });

    expect(handler).toHaveBeenCalledOnce();
  });

  it("isolates events from each other", () => {
    const bus = createBus({ onProblem: () => {} });
    const handler = vi.fn();

    bus.subscribe("compare:closed", handler);
    bus.publish("sheet:error", { sheetId: "A-101", code: "network" });

    expect(handler).not.toHaveBeenCalled();
  });
});

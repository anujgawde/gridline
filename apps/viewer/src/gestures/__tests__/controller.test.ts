import { describe, expect, it } from "vitest";

import { GestureController } from "../controller";
import type { GestureView } from "../types";

/* Just enough of an element for the controller: it registers listeners, asks
   for its box and captures pointers. Tests run in Node, with no DOM. */
function fakeElement() {
  const listeners = new Map<string, (event: unknown) => void>();
  const element = {
    addEventListener: (type: string, fn: (event: unknown) => void) =>
      listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    setPointerCapture: () => {},
    clientWidth: 800,
    clientHeight: 600,
  };
  const fire = (type: string, pointerId: number, x: number, y: number) =>
    listeners.get(type)?.({ pointerId, clientX: x, clientY: y });
  return { element: element as unknown as HTMLElement, fire };
}

const START: GestureView = { x: 0, y: 0, scale: 1 };

function setup() {
  const { element, fire } = fakeElement();
  /* Momentum off: a release would otherwise schedule an animation frame,
     which Node does not have, and coasting is not what these tests are about. */
  const controller = new GestureController(START, {
    minScale: 0.01,
    maxScale: 10,
    momentum: false,
    onChange: () => {},
  });
  controller.attach(element);
  return { controller, fire };
}

describe("GestureController single-pointer mode", () => {
  it("pans with one pointer by default", () => {
    const { controller, fire } = setup();
    fire("pointerdown", 1, 100, 100);
    fire("pointermove", 1, 130, 120);
    expect(controller.view).toEqual({ x: 30, y: 20, scale: 1 });
    expect(controller.phase).toBe("panning");
  });

  it("moves nothing with one pointer under pass", () => {
    const { controller, fire } = setup();
    controller.setSinglePointer("pass");
    fire("pointerdown", 1, 100, 100);
    fire("pointermove", 1, 130, 120);
    expect(controller.view).toEqual(START);
    expect(controller.phase).toBe("idle");
  });

  it("still pinches with two pointers under pass", () => {
    const { controller, fire } = setup();
    controller.setSinglePointer("pass");
    fire("pointerdown", 1, 300, 300);
    fire("pointerdown", 2, 400, 300);
    expect(controller.phase).toBe("pinching");
    fire("pointermove", 2, 500, 300);
    expect(controller.view.scale).toBeCloseTo(2);
  });

  it("goes idle, not panning, when a pinch drops to one pointer under pass", () => {
    const { controller, fire } = setup();
    controller.setSinglePointer("pass");
    fire("pointerdown", 1, 300, 300);
    fire("pointerdown", 2, 400, 300);
    fire("pointerup", 2, 400, 300);
    const after = controller.view;
    fire("pointermove", 1, 350, 350);
    expect(controller.phase).toBe("idle");
    expect(controller.view).toEqual(after);
  });

  it("stops a pan in progress when switched to pass", () => {
    const { controller, fire } = setup();
    fire("pointerdown", 1, 100, 100);
    fire("pointermove", 1, 110, 100);
    controller.setSinglePointer("pass");
    fire("pointermove", 1, 200, 100);
    expect(controller.view.x).toBe(10);
  });

  it("pans again on the next pointer after switching back", () => {
    const { controller, fire } = setup();
    controller.setSinglePointer("pass");
    fire("pointerdown", 1, 100, 100);
    fire("pointerup", 1, 100, 100);
    controller.setSinglePointer("pan");
    fire("pointerdown", 1, 100, 100);
    fire("pointermove", 1, 150, 100);
    expect(controller.view.x).toBe(50);
  });
});

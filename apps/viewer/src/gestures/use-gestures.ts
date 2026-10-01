import { useEffect, useRef } from "react";
import type { RefObject } from "react";

import { GestureController } from "./controller";
import type { GestureHandle, GestureOptions, GestureView } from "./types";

interface UseGesturesOptions extends GestureOptions {
  initial: GestureView;
}

/* Binds a controller to an element for the life of the component.

   The controller is created once and never replaced, so a re-render cannot
   reset a gesture in progress. `onChange` is read through a ref for the same
   reason: a caller that passes a fresh closure every render — which is the
   normal thing to do — must not tear down a pinch to do it. */
export function useGestures(
  hostRef: RefObject<HTMLElement | null>,
  { initial, onChange, minScale, maxScale, momentum }: UseGesturesOptions,
): GestureHandle {
  const changeRef = useRef(onChange);

  useEffect(() => {
    changeRef.current = onChange;
  }, [onChange]);

  const controllerRef = useRef<GestureController>(null);
  controllerRef.current ??= new GestureController(initial, {
    minScale,
    maxScale,
    momentum,
    onChange: (view) => changeRef.current(view),
  });

  const controller = controllerRef.current;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    controller.attach(host);
    return () => controller.detach();
  }, [controller, hostRef]);

  return controller;
}

import { useEffect, useRef, useState } from "react";

import type { Size } from "../view";

/* The element a canvas fills, and its size once laid out. */
export function useStage(onResize?: (size: Size) => void) {
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const next = {
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      };
      setSize(next);
      onResize?.(next);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onResize]);

  return { host, size };
}

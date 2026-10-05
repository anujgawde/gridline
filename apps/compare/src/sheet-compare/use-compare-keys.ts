import { useEffect, useRef, useState } from "react";

/* Compare's single-letter keys, each mapped to an action by its lowercase
   letter. Holding Shift unlocks until it is let go, for a quick look at one
   pane without losing the alignment; returns whether Shift is held. Typing in
   a field is left alone. */
export function useCompareKeys(actions: Record<string, () => void>) {
  const [shiftHeld, setShiftHeld] = useState(false);
  const latest = useRef(actions);
  latest.current = actions;

  useEffect(() => {
    const typing = (e: KeyboardEvent) =>
      e.target instanceof HTMLElement && e.target.closest("textarea, select, input:not([type=range])") !== null;

    const down = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        setShiftHeld(true);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
      latest.current[e.key.toLowerCase()]?.();
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(false);
    };
    // A Shift released in another window never sends keyup here.
    const blur = () => setShiftHeld(false);

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  return shiftHeld;
}

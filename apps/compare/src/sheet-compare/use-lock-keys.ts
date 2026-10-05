import { useEffect, useState } from "react";

/* L toggles the lock; holding Shift unlocks until it is let go, for a quick
   look at one pane without losing the alignment. Returns whether Shift is
   held. Typing in a field is left alone. */
export function useLockKeys(onToggle: () => void) {
  const [shiftHeld, setShiftHeld] = useState(false);

  useEffect(() => {
    const typing = (e: KeyboardEvent) =>
      e.target instanceof HTMLElement && e.target.closest("input, textarea, select") !== null;

    const down = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(true);
      else if (e.key.toLowerCase() === "l" && !e.metaKey && !e.ctrlKey && !e.altKey && !typing(e)) {
        onToggle();
      }
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
  }, [onToggle]);

  return shiftHeld;
}

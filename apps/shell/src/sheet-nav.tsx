import { useState } from "react";

import { bus } from "@gridline/platform/bus";

/* Minimal navigation: enough to move around a 1,500-sheet set without reloading.

   Navigator will replace this with a virtualised grid over the whole set. Until
   then something has to exist, because a session that cannot change sheets
   cannot accumulate anything — and every claim about memory and degradation is a
   claim about what accumulates.

   It publishes `sheet:open` rather than calling into the viewer. That is the
   only sanctioned cross-MFE channel, and using it here means the viewer is
   already being driven the way Navigator will drive it. */
export function SheetNav({ sheetId }: { sheetId: string }) {
  const [draft, setDraft] = useState("");

  const open = (next: string) => {
    bus.publish("sheet:open", { sheetId: next, source: "shell" });
  };

  const step = (delta: number) => {
    const match = /^([A-Z]{1,2})-(\d{3})$/.exec(sheetId);
    if (!match) return;
    const number = Number(match[2]) + delta;
    const series = Math.floor(number / 100) * 100;
    if (number <= series || number > series + 99) return;
    open(`${match[1]}-${number}`);
  };

  return (
    <form
      className="shell-nav"
      onSubmit={(event) => {
        event.preventDefault();
        const value = draft.trim().toUpperCase();
        if (/^[A-Z]{1,2}-\d{3}$/.test(value)) open(value);
        setDraft("");
      }}
    >
      <button type="button" onClick={() => step(-1)} aria-label="Previous sheet">
        ‹
      </button>
      <button type="button" onClick={() => step(1)} aria-label="Next sheet">
        ›
      </button>
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="A-101"
        aria-label="Go to sheet"
        spellCheck={false}
      />
    </form>
  );
}

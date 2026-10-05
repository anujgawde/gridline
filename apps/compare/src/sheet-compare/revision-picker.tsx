import { Icon } from "@gridline/platform/ui";

import type { Side } from "./types";

interface RevisionPickerProps {
  side: Side;
  value: number;
  /* The revisions this side may show. Always includes `value`. */
  choices: number[];
  onChange: (revision: number) => void;
}

/* A native <select> under the chip, transparent: keyboard, screen readers and
   touch all get the platform's own picker, and nothing new is needed in the
   design system. Always a picker, even with one choice — a control that
   changes form with its data reads as two different controls. */
export function RevisionPicker({ side, value, choices, onChange }: RevisionPickerProps) {
  return (
    <span className="compare-rev-chip">
      <span className="compare-swatch" data-side={side} />
      REV {value}
      <Icon name="chevron-down" size={16} />
      <select
        className="compare-rev-select"
        aria-label={side === "from" ? "From revision" : "To revision"}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {choices.map((r) => (
          <option key={r} value={r}>
            REV {r}
          </option>
        ))}
      </select>
    </span>
  );
}

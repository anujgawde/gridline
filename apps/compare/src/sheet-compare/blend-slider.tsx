import { ToolbarSeparator } from "@gridline/platform/ui";

import { blendLabel } from "./blend";

interface BlendSliderProps {
  blend: number;
  from: number;
  to: number;
  onBlendChange: (blend: number) => void;
}

/* A native range input, so keys, touch and screen readers come with it; the
   ticks behind it mark the two ends and the point where both are drawn. */
export function BlendSlider({ blend, from, to, onBlendChange }: BlendSliderProps) {
  const label = blendLabel(blend, from, to);
  return (
    <>
      <span className="compare-blend-end">
        <span className="compare-swatch" data-side="from" />
        REV {from}
      </span>
      <span className="compare-blend-track">
        <span className="compare-blend-tick" data-at="start" />
        <span className="compare-blend-tick" data-at="middle" />
        <span className="compare-blend-tick" data-at="end" />
        <input
          className="compare-blend-input"
          type="range"
          min={0}
          max={100}
          step={5}
          value={blend}
          aria-label="Blend between revisions"
          aria-valuetext={label}
          onChange={(e) => onBlendChange(Number(e.target.value))}
        />
      </span>
      <span className="compare-blend-end">
        <span className="compare-swatch" data-side="to" />
        REV {to}
      </span>
      <ToolbarSeparator />
      <span className="compare-blend-label">{label}</span>
      <ToolbarSeparator />
    </>
  );
}

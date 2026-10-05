import { Icon } from "@gridline/platform/ui";
import type { IconName } from "@gridline/platform/ui";

import type { CompareMode } from "./types";

interface ModeSwitchProps {
  mode: CompareMode;
  onModeChange: (mode: CompareMode) => void;
}

const MODES: { mode: CompareMode; label: string; icon: IconName; key: string }[] = [
  { mode: "onion", label: "Onion skin", icon: "layers", key: "O" },
  { mode: "side", label: "Side by side", icon: "columns-2", key: "S" },
];

/* How the two revisions are shown: blended on one canvas, or in two panes. */
export function ModeSwitch({ mode, onModeChange }: ModeSwitchProps) {
  return (
    <div className="compare-modes" role="group" aria-label="Compare mode">
      {MODES.map((m) => (
        <button
          key={m.mode}
          type="button"
          className="compare-mode"
          aria-pressed={mode === m.mode}
          onClick={() => onModeChange(m.mode)}
        >
          <Icon name={m.icon} size={16} />
          <span>{m.label}</span>
          <span className="compare-key-hint">{m.key}</span>
        </button>
      ))}
    </div>
  );
}

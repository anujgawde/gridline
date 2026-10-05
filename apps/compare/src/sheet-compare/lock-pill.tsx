import { Icon, IconButton } from "@gridline/platform/ui";

interface LockPillProps {
  locked: boolean;
  onLockedChange: (locked: boolean) => void;
}

/* Says, over the seam between the panes, whether they move together — and
   how to change it. */
export function LockPill({ locked, onLockedChange }: LockPillProps) {
  return (
    <div className="compare-lock-pill" data-locked={locked}>
      <Icon name={locked ? "link" : "unlink"} size={16} />
      <span className="compare-lock-title">
        {locked ? "Pan + zoom locked" : "Panes unlocked"}
      </span>
      <span className="compare-lock-hint">
        {locked ? "hold ⇧ to unlock" : "each pane pans on its own"}
      </span>
      <IconButton
        icon={locked ? "unlink" : "link"}
        label={locked ? "Unlock panes" : "Relock panes"}
        size="sm"
        onClick={() => onLockedChange(!locked)}
      />
    </div>
  );
}

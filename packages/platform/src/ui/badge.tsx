import { Icon } from "./icon.js";
import type {
  BadgeProps,
  IconName,
  RevisionBadgeProps,
  RevisionStatus,
} from "./types.js";

export function Badge({
  tone = "neutral",
  icon,
  mono = false,
  small = false,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={[
        "gf-badge",
        `gf-badge--${tone}`,
        mono ? "gf-badge--mono" : "",
        small ? "gf-badge--sm" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </span>
  );
}

/* Status carries both an icon and a word, never colour alone — the set this is
   built for gets read in direct sunlight on a cracked tablet screen, and
   "superseded" is the one state where being wrong means building from the wrong
   drawing. */
const STATUS: Record<
  RevisionStatus,
  { icon: IconName | null; label: string }
> = {
  current: { icon: null, label: "Current" },
  superseded: { icon: "alert-triangle", label: "Superseded" },
  pending: { icon: "cloud-off", label: "Pending sync" },
  void: { icon: "slash", label: "Void" },
};

export function RevisionBadge({
  rev,
  status = "current",
  small = false,
  showLabel = true,
  ...rest
}: RevisionBadgeProps) {
  const meta = STATUS[status];
  return (
    <span
      role="status"
      title={`${meta.label} · REV ${rev}`}
      className={[
        "gf-revbadge",
        `gf-revbadge--${status}`,
        small ? "gf-revbadge--sm" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      <span className="gf-revbadge-rev">
        {meta.icon ? <Icon name={meta.icon} size={16} /> : null}
        {`REV ${rev}`}
      </span>
      {showLabel && status !== "current" ? (
        <span className="gf-revbadge-label">{meta.label}</span>
      ) : null}
    </span>
  );
}

import type {
  ToolbarProps,
  ToolbarSeparatorProps,
} from "./types.js";

export function Toolbar({
  tier = "chrome",
  orientation = "horizontal",
  align = "start",
  children,
  ...rest
}: ToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-orientation={orientation}
      className={[
        "gf-toolbar",
        `gf-toolbar--${tier}`,
        `gf-toolbar--${orientation}`,
        `gf-toolbar--align-${align}`,
      ].join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}

/* Decoration, so aria-hidden. A separator that announces itself adds noise to
   every pass through a toolbar. */
export function ToolbarSeparator({
  orientation = "vertical",
}: ToolbarSeparatorProps) {
  return (
    <span
      aria-hidden="true"
      className={`gf-toolbar-sep gf-toolbar-sep--${orientation}`}
    />
  );
}

export function ToolbarSpacer() {
  return <span aria-hidden="true" className="gf-toolbar-spacer" />;
}

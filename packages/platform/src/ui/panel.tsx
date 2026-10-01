import type { PanelHeaderProps, PanelProps } from "./types.js";

export function Panel({
  side = "left",
  wide = false,
  floating = false,
  header,
  footer,
  children,
  ...rest
}: PanelProps) {
  return (
    <section
      className={[
        "gf-panel",
        `gf-panel--${side}`,
        wide ? "gf-panel--wide" : "",
        floating ? "gf-panel--floating" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {header}
      {/* The scroll container is the body, never the panel, so a sticky header
          stays put while a long properties list moves under it. */}
      <div className="gf-panel-body">{children}</div>
      {footer ? <div className="gf-panel-footer">{footer}</div> : null}
    </section>
  );
}

export function PanelHeader({
  title,
  meta,
  actions,
  children,
  ...rest
}: PanelHeaderProps) {
  return (
    <header className="gf-panel-header" {...rest}>
      <div className="gf-panel-header-text">
        <div className="gf-panel-header-title">{title}</div>
        {meta ? <div className="gf-panel-header-meta">{meta}</div> : null}
      </div>
      {children}
      {actions ? <div className="gf-panel-header-actions">{actions}</div> : null}
    </header>
  );
}

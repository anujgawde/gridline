import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

/* The icon set is closed on purpose. Every name here is drawn by `icon.tsx` as
   inline SVG, so adding an icon is a deliberate edit rather than a string that
   silently renders nothing. */
export type IconName =
  | "alert-triangle"
  | "check"
  | "cloud-off"
  | "hand"
  | "maximize"
  | "message-square"
  | "minus"
  | "pencil"
  | "plus"
  | "ruler"
  | "search-x"
  | "slash"
  | "square-dashed"
  | "x";

/* Icon sizes are px because an icon pairs with a touch target, and the target is
   a physical dimension. The tokens for these are --icon-16/20/24. */
export type IconSize = 16 | 20 | 24;

export interface IconProps {
  name: IconName;
  size?: IconSize;
  className?: string;
}

export type ControlSize = "sm" | "md" | "lg";
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  variant?: ButtonVariant;
  size?: ControlSize;
  fullWidth?: boolean;
  icon?: IconName;
  iconRight?: IconName;
  children?: ReactNode;
}

export type IconButtonVariant = "ghost" | "secondary" | "primary";

export interface IconButtonProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "className" | "aria-label" | "aria-pressed"
  > {
  icon: IconName;
  /* Required, not optional. An icon-only control with no accessible name is
     unusable with a screen reader, and making the prop optional is how that
     happens by accident. It is also the tooltip. */
  label: string;
  size?: ControlSize;
  variant?: IconButtonVariant;
  /* Renders as aria-pressed, so a selected tool is announced as such rather
     than only looking different. */
  active?: boolean;
}

export type ToolbarTier = "chrome" | "overlay";
export type ToolbarOrientation = "horizontal" | "vertical";
export type ToolbarAlign = "start" | "center" | "end" | "between";

export interface ToolbarProps extends Omit<HTMLAttributes<HTMLDivElement>, "className" | "role"> {
  /* "chrome" is docked app frame; "overlay" floats over the drawing and is
     always an opaque fill with a hairline border and a dark ring, so it reads
     against white paper and black linework alike. */
  tier?: ToolbarTier;
  orientation?: ToolbarOrientation;
  align?: ToolbarAlign;
  children?: ReactNode;
}

export interface ToolbarSeparatorProps {
  orientation?: ToolbarOrientation;
}

export type PanelSide = "left" | "right";

export interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, "className"> {
  side?: PanelSide;
  /* Picks --panel-w-wide over --panel-w. A boolean rather than a length, so an
     app never writes a raw width. */
  wide?: boolean;
  floating?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
}

export interface PanelHeaderProps extends Omit<HTMLAttributes<HTMLElement>, "className"> {
  title: string;
  meta?: string;
  actions?: ReactNode;
  children?: ReactNode;
}

export type BadgeTone = "neutral" | "accent" | "success" | "error" | "sync";

export interface BadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, "className"> {
  tone?: BadgeTone;
  icon?: IconName;
  /* Tabular mono rather than uppercase micro — for anything that is a value
     being compared rather than a word being read. */
  mono?: boolean;
  small?: boolean;
  children?: ReactNode;
}

/* Reserved vocabulary. "superseded" is the one signal the supersede colour ramp
   exists for, and it is never used decoratively. */
export type RevisionStatus = "current" | "superseded" | "pending" | "void";

export interface RevisionBadgeProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "className" | "role" | "rev"> {
  /* Shadows the legacy HTML `rev` attribute, which is why it is omitted above:
     this is a revision number, not a reverse link type. */
  rev: number | string;
  status?: RevisionStatus;
  small?: boolean;
  showLabel?: boolean;
}

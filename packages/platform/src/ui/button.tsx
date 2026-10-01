import { Icon } from "./icon.js";
import type { ButtonProps, IconButtonProps } from "./types.js";

/* Interaction state is CSS, not React state.

   The design system's reference implementation keeps `hover` and `press` in
   useState. That is fine in a mockup and wrong here: every pointer crossing a
   toolbar would re-render React while the canvas is mid-gesture, on the same
   main thread the frame budget is measured on. :hover and :active cost nothing
   and work before hydration. */

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  icon,
  iconRight,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const glyph: 16 | 20 = size === "sm" ? 16 : 20;
  return (
    <button
      type={type}
      className={[
        "gf-btn",
        `gf-btn--${variant}`,
        `gf-btn--${size}`,
        fullWidth ? "gf-btn--full" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {icon ? <Icon name={icon} size={glyph} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={glyph} /> : null}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  size = "md",
  variant = "ghost",
  active = false,
  ...rest
}: IconButtonProps) {
  const glyph: IconButtonGlyph = GLYPH[size];
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active || undefined}
      title={label}
      className={`gf-iconbtn gf-iconbtn--${variant} gf-iconbtn--${size}`}
      {...rest}
    >
      <Icon name={icon} size={glyph} />
    </button>
  );
}

type IconButtonGlyph = 16 | 20 | 24;

const GLYPH: Record<"sm" | "md" | "lg", IconButtonGlyph> = {
  sm: 16,
  md: 20,
  lg: 24,
};

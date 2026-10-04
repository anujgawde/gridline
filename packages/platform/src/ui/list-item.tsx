import type { ListItemProps } from "./types.js";

/* One row of a list: a code, a title, and an optional trailing value.

   A button, not the design system's `div role="option"`: a row that opens
   something is a button to a keyboard and a screen reader, and gets focus and
   activation without handlers of its own. Selection is `aria-current`, the
   attribute for "the one being shown", rather than `aria-selected`, which
   belongs inside a listbox.

   The title never wraps, so every row is the same height; a list that lays
   rows out by measurement depends on that. Hover and press are CSS, as in
   Button. */
export function ListItem({ code, title, meta, selected = false, type = "button", ...rest }: ListItemProps) {
  return (
    <button
      type={type}
      className={selected ? "gf-list-item gf-list-item--selected" : "gf-list-item"}
      aria-current={selected || undefined}
      {...rest}
    >
      {code ? <span className="gf-list-item-code">{code}</span> : null}
      <span className="gf-list-item-title">{title}</span>
      {meta ? <span className="gf-list-item-meta">{meta}</span> : null}
    </button>
  );
}

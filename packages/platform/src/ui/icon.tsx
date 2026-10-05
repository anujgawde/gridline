import type { IconName, IconProps } from "./types.js";

/* Icons are inline SVG, drawn from path data held here.

   The design system's reference implementation points `mask-image` at
   unpkg.com. That is wrong for this app twice over: it is a fourth origin
   nobody in this project controls, and an app whose whole premise is a drawing
   set on a tablet in a basement cannot have its controls go blank when the
   network does. Inline paths cost bytes once in the bundle and then always
   work.

   Geometry is lucide's, on a 24x24 grid with a 2px stroke, so the set stays
   visually consistent with the mockups it was designed against. */
const PATHS: Record<IconName, readonly string[]> = {
  "alert-triangle": [
    "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",
    "M12 9v4",
    "M12 17h.01",
  ],
  check: ["M20 6 9 17l-5-5"],
  "chevron-down": ["m6 9 6 6 6-6"],
  "chevron-up": ["m18 15-6-6-6 6"],
  "cloud-off": [
    "m2 2 20 20",
    "M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193",
    "M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07",
  ],
  "columns-2": [
    "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",
    "M12 3v18",
  ],
  hand: [
    "M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2",
    "M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2",
    "M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8",
    "M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15",
  ],
  layers: [
    "m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z",
    "m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65",
    "m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65",
  ],
  link: [
    "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71",
    "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  ],
  maximize: [
    "M8 3H5a2 2 0 0 0-2 2v3",
    "M16 3h3a2 2 0 0 1 2 2v3",
    "M8 21H5a2 2 0 0 1-2-2v-3",
    "M16 21h3a2 2 0 0 0 2-2v-3",
  ],
  "message-square": ["M22 17a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"],
  minus: ["M5 12h14"],
  pencil: [
    "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
    "m15 5 4 4",
  ],
  plus: ["M5 12h14", "M12 5v14"],
  ruler: [
    "M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z",
    "m14.5 12.5-2 2",
    "m11.5 9.5-2 2",
    "m8.5 6.5-2 2",
    "m17.5 15.5-2 2",
  ],
  "search-x": [
    "m13.5 8.5-5 5",
    "m8.5 8.5 5 5",
    "M19 11a8 8 0 1 1-16 0a8 8 0 0 1 16 0",
    "m21 21-4.3-4.3",
  ],
  slash: ["M22 2 2 22"],
  "square-dashed": [
    "M5 3a2 2 0 0 0-2 2",
    "M19 3a2 2 0 0 1 2 2",
    "M21 19a2 2 0 0 1-2 2",
    "M5 21a2 2 0 0 1-2-2",
    "M9 3h1",
    "M9 21h1",
    "M14 3h1",
    "M14 21h1",
    "M3 9v1",
    "M21 9v1",
    "M3 14v1",
    "M21 14v1",
  ],
  unlink: [
    "m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71",
    "m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71",
    "M8 2v3",
    "M2 8h3",
    "M16 19v3",
    "M19 16h3",
  ],
  x: ["M18 6 6 18", "m6 6 12 12"],
};

/* aria-hidden throughout: an icon is decoration. The accessible name belongs to
   the control wrapping it, which is why IconButton requires a label. */
export function Icon({ name, size = 20, className }: IconProps) {
  return (
    <svg
      className={className ? `gf-icon ${className}` : "gf-icon"}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

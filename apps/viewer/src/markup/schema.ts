import { z } from "zod";

/* Every coordinate here is sheet-space, in points: the units of the sheet
   index's pageWidth and pageHeight. A markup never stores a screen position,
   so it sits on the same ink at every zoom, deep zoom included. */
export const Point = z.tuple([z.number(), z.number()]);
export type Point = z.infer<typeof Point>;

/* Token names, never colour values. The token resolves per theme, so sunlight
   mode re-maps a markup without the markup changing. */
export const MarkupColour = z.enum(["markup-default"]);
export type MarkupColour = z.infer<typeof MarkupColour>;

const common = {
  /* A UUID rather than a counter, so a write replayed after going offline can
     be recognised as one that already landed. */
  id: z.uuid(),
  sheetId: z.string().min(1),
  revision: z.number().int().positive(),
  /* The "#n" a person reads in the list. Assigned per sheet, never reused. */
  number: z.number().int().positive(),
  colour: MarkupColour,
  strokeWidth: z.number().positive(),
  note: z.string().optional(),
  author: z.string().min(1),
  createdAt: z.iso.datetime(),
};

const box = {
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
};

export const InkMarkup = z.object({
  ...common,
  kind: z.literal("ink"),
  points: z.array(Point).min(2),
});

export const RectMarkup = z.object({ ...common, ...box, kind: z.literal("rect") });

/* Same geometry as a rect. The box is the cloud's outer edge; the scallops
   are drawn inside it, so its bounds need no allowance for them. */
export const CloudMarkup = z.object({ ...common, ...box, kind: z.literal("cloud") });

/* The box is the laid-out text's extent, measured by whoever placed it. The
   model has no font metrics, so it is told the size rather than computing it. */
export const TextMarkup = z.object({
  ...common,
  ...box,
  kind: z.literal("text"),
  text: z.string().min(1),
  size: z.number().positive(),
});

export const Markup = z.discriminatedUnion("kind", [
  InkMarkup,
  RectMarkup,
  CloudMarkup,
  TextMarkup,
]);
export type Markup = z.infer<typeof Markup>;
export type MarkupKind = Markup["kind"];

/* Omit over each member of a union, rather than over the union as a whole,
   which would keep only the fields every kind shares. */
type OmitEach<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/* What a tool hands the store. The store assigns identity, numbering, sheet
   and timestamp, so no tool can get them wrong. */
export type MarkupDraft = OmitEach<Markup, "id" | "number" | "sheetId" | "createdAt">;

/* What an edit may change: anything but identity, sheet and creation time.
   Partial distributes over the union, so a patch is per kind. */
export type MarkupPatch = Partial<MarkupDraft>;

import { z } from "zod";

export const MfeId = z.enum(["shell", "viewer", "navigator", "compare"]);
export type MfeId = z.infer<typeof MfeId>;

const SheetId = z.string().min(1);
const Revision = z.number().int().positive();

/** Sheet-space, never screen-space. Screen coordinates in a cross-MFE payload are a bug. */
export const BBox = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
});
export type BBox = z.infer<typeof BBox>;

export const eventContracts = {
  "sheet:open": z.object({
    sheetId: SheetId,
    revision: Revision.optional(),
    source: MfeId,
  }),
  "sheet:loaded": z.object({
    sheetId: SheetId,
    revision: Revision,
    pageCount: z.number().int().positive(),
  }),
  "sheet:error": z.object({
    sheetId: SheetId,
    code: z.enum(["not-found", "parse", "network"]),
  }),
  "viewport:changed": z.object({
    sheetId: SheetId,
    x: z.number(),
    y: z.number(),
    scale: z.number().positive(),
  }),
  "viewport:focus-region": z.object({
    sheetId: SheetId,
    bbox: BBox,
    animate: z.boolean(),
  }),
  "compare:request": z.object({
    sheetId: SheetId,
    from: Revision,
    to: Revision,
  }),
  "compare:closed": z.object({
    sheetId: SheetId,
  }),
} as const;

export type GridlineEvents = {
  [K in keyof typeof eventContracts]: z.infer<(typeof eventContracts)[K]>;
};

export type GridlineEventName = keyof GridlineEvents;

export const eventNames = Object.keys(eventContracts) as GridlineEventName[];

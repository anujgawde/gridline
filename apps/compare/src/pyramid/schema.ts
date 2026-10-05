import { z } from "zod";

/* A revision's tile-index.json, validated on read like every document arriving
   over the network. Only the fields a pane draws from. */
export const TileIndex = z.object({
  pageWidth: z.number().positive(),
  pageHeight: z.number().positive(),
  levels: z
    .object({
      level: z.number().int().nonnegative(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      cols: z.number().int().positive(),
      rows: z.number().int().positive(),
    })
    .array()
    .min(1),
});
export type TileIndex = z.infer<typeof TileIndex>;
export type TileLevel = TileIndex["levels"][number];

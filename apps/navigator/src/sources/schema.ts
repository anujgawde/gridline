import { z } from "zod";

export const SourceLookup = z.object({
  sheets: z.object({ baseUrl: z.string().url() }),
});
export type SheetSource = z.infer<typeof SourceLookup>["sheets"];

export const SheetIndex = z.object({
  sheets: z
    .object({
      sheetId: z.string().min(1),
      title: z.string(),
      discipline: z.string().min(1),
      pageNumber: z.number().int().positive(),
      /* The latest revision. Present only on reissued sheets; absent means
         the sheet has only ever been issued once. */
      revision: z.number().int().positive().default(1),
    })
    .array()
    .min(1),
});
export type SheetIndexEntry = z.infer<typeof SheetIndex>["sheets"][number];

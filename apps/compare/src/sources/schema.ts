import { z } from "zod";

export const SourceLookup = z.object({
  sheets: z.object({ baseUrl: z.string().url() }),
});
export type SheetSource = z.infer<typeof SourceLookup>["sheets"];

/* Only what compare reads from the sheet index: how many times each sheet has
   been issued. Absent means once. The navigator keeps its own, fuller copy of
   this shape — remotes do not import each other. */
export const SheetIndex = z.object({
  sheets: z
    .object({
      sheetId: z.string().min(1),
      revision: z.number().int().positive().default(1),
    })
    .array(),
});

import { z } from "zod";

export const SourceLookup = z.object({
  sheets: z.object({ baseUrl: z.string().url() }),
});
export type SheetSource = z.infer<typeof SourceLookup>["sheets"];

import { z } from "zod";
export const mutationSchema = z.object({
  summary: z.string(),
  needsReplan: z.boolean(),
  reason: z.string().nullable(),
});

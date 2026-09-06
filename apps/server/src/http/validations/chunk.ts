import z from "zod";

export const chunkSearchQuerySchema = z.object({
  q: z.string().min(1).max(1000),
  limit: z.coerce.number().int().positive().max(20).optional(),
});

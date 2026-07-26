import z from "zod";

export const queueParamSchema = z.object({
  queue: z.string().min(1),
});

export const queueJobParamSchema = z.object({
  queue: z.string().min(1),
  jobId: z.string().min(1),
});

export const queueFailedQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().gte(1).optional(),
  })
  .optional();

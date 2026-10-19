import z from "zod";

export const agentParamSchema = z.object({
  clientId: z.string().min(1).max(255),
});

export const agentRequestQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
  })
  .optional();

export const agentRequestParamSchema = z.object({
  clientId: z.string().min(1).max(255),
  requestId: z.coerce.number().int().positive().max(2_147_483_647),
});

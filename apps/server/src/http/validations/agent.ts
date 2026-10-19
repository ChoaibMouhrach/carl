import z from "zod";

export const agentParamSchema = z.object({
  clientId: z.string().min(1).max(255),
});

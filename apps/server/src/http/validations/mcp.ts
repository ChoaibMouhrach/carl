import { z } from "zod";

export const mcpClientIdParamSchema = z.object({
  clientId: z.string().min(1),
});

import z from "zod";

export const clientQuerySchema = z
  .object({
    search: z.string().max(255).optional(),
    page: z.coerce.number().int().positive().gte(1).optional(),
  })
  .optional();

export const clientIdParamSchema = z.object({
  clientId: z.coerce.number().int().positive(),
});

export const createClientSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.email().max(255),
});

export const updateClientSchema = createClientSchema;

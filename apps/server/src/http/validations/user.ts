import z from "zod";
import { roles } from "@server/config/constants";
import { passwordSchema } from "./auth";

export const createUserSchema = z.object({
  email: z.email().max(255),
  password: passwordSchema,
  role: z.enum(roles),
});

export const userQuerySchema = z
  .object({
    search: z.string().max(255).optional(),
    page: z.coerce.number().int().positive().gte(1).optional(),
    role: z.enum(roles).optional(),
  })
  .optional();

export const userIdParamSchema = z.object({
  userId: z.coerce.number().int().positive(),
});

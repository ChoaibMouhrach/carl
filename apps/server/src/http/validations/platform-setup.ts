import z from "zod";
import { passwordSchema } from "./auth";

export const platformSetupSchema = z.object({
  name: z.string().trim().min(1).max(255),
  email: z.email(),
  password: passwordSchema,
});

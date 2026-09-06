import { z } from "zod";

const schema = z.object({
  VITE_API_URL: z.url(),
  VITE_LP_URL: z.url(),
  VITE_SENTRY_DSN: z.url().optional(),
});

export const env = schema.parse(import.meta.env);

export type ENV = typeof env;

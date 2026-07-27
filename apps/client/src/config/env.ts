import { z } from "zod";

const schema = z.object({
  VITE_API_URL: z.url(),
  VITE_LP_URL: z.url(),
  VITE_SENTRY_DSN: z.url().optional(),
});

const parsed = schema.safeParse(import.meta.env);

if (!parsed.success) {
  console.error("Invalid client environment variables:", parsed.error.format());
  throw new Error("Invalid client environment variables");
}

export const env = parsed.data;

export type ENV = typeof env;

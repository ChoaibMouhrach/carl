import { z } from "zod";

const schema = z.object({
  VITE_API_URL: z.url(),
  VITE_SENTRY_DSN: z.url().optional(),
});

// Production values are injected by the server at request time (window.__ENV__);
// Vite's import.meta.env only supplies them in dev.
const runtimeEnv = typeof window === "undefined" ? undefined : window.__ENV__;

export const env = schema.parse({ ...import.meta.env, ...runtimeEnv });

export type ENV = typeof env;

import { z } from "zod";
import { config } from "dotenv";

config({
  path: "../../.env",
});

const schema = z.object({
  NEXT_PUBLIC_CLIENT_URL: z.url(),
  NEXT_PUBLIC_SITE_URL: z.url(),
  NEXT_PUBLIC_SENTRY_DSN: z.url(),
});

const parsed = schema.parse(process.env);

export const env = {
  ...parsed,
  APP_URL: new URL("/app", parsed.NEXT_PUBLIC_CLIENT_URL).toString(),
  SITE_URL: parsed.NEXT_PUBLIC_SITE_URL,
};

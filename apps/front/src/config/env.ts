import { z } from "zod";
import { config } from "dotenv";

config({
  path: "../../.env",
});

const schema = z.object({
  NEXT_PUBLIC_CLIENT_URL: z.url(),
});

const parsed = schema.parse({
  NEXT_PUBLIC_CLIENT_URL: process.env["NEXT_PUBLIC_CLIENT_URL"],
});

export const env = {
  ...parsed,
  APP_URL: new URL("/app", parsed.NEXT_PUBLIC_CLIENT_URL).toString(),
};

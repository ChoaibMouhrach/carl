import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { SeedConfig } from "@repo/server/testing/e2e-seed";

loadEnv({ path: path.resolve(__dirname, "../../.env") });

const required = (key: string): string => {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }

  return value;
};

const WEB_ORIGIN = process.env.CLIENT_URL ?? "http://localhost:5173";

export const CLIENT_URL = process.env.E2E_BASE_URL ?? WEB_ORIGIN;

const API_URL = process.env.VITE_API_URL ?? "http://localhost:3002";

export const seedConfig = (): SeedConfig => ({
  apiUrl: API_URL,
  authSecret: required("BETTER_AUTH_SECRET"),
  redisUrl: `redis://:${encodeURIComponent(required("REDIS_PASSWORD"))}@${required("REDIS_HOST")}:${required("REDIS_PORT")}`,
  webOrigin: WEB_ORIGIN,
  databaseUrl: `postgresql://${required("POSTGRES_USER")}:${encodeURIComponent(
    required("POSTGRES_PASS"),
  )}@${required("POSTGRES_HOST")}:${required("POSTGRES_PORT")}/${required(
    "POSTGRES_NAME",
  )}`,
});

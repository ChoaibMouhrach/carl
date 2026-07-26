import { z } from "zod";
import { config } from "dotenv";

config({
  path: "../../.env",
});

const schema = z
  .object({
    // APP
    NODE_ENV: z.enum(["development", "production", "test"]),

    // API
    API_PORT: z.coerce.number().int().positive(),
    VITE_API_URL: z.url(),

    // CLIENT
    CLIENT_URL: z.url(),

    // AUTH
    BETTER_AUTH_SECRET: z.string().min(32),

    // Database
    POSTGRES_HOST: z.string().nonempty(),
    POSTGRES_PORT: z.coerce.number().int().positive(),
    POSTGRES_USER: z.string().nonempty(),
    POSTGRES_PASS: z.string().nonempty(),
    POSTGRES_NAME: z.string().nonempty(),

    // Queue
    REDIS_HOST: z.string().nonempty(),
    REDIS_PORT: z.coerce.number().int().positive(),
    REDIS_PASSWORD: z.string().nonempty(),
    RATE_LIMIT_KEY_SECRET: z.string().min(32),
    TRUST_PROXY: z.stringbool().default(false),
    QUEUE_CONCURRENCY: z.coerce.number().int().positive().default(5),

    // S3
    S3_ENDPOINT: z.url(),
    S3_REGION: z.string().nonempty(),
    S3_ACCESS_KEY: z.string().nonempty(),
    S3_SECRET_KEY: z.string().nonempty(),
    S3_BUCKET_NAME: z.string().nonempty(),
    S3_PUBLIC_URL: z.url(),

    // Mail
    RESEND_API_KEY: z.string().nonempty(),
    MAIL_DOMAIN: z.string().nonempty(),
    MAIL_RATE_LIMIT_PER_SECOND: z.coerce.number().positive().default(2),

    // Billing
    STRIPE_SECRET_KEY: z.string().nonempty().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().nonempty().optional(),
  })
  .refine(
    (env) =>
      Boolean(env.STRIPE_SECRET_KEY) === Boolean(env.STRIPE_WEBHOOK_SECRET),
    {
      message:
        "STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET must be configured together.",
      path: ["STRIPE_SECRET_KEY"],
    },
  );

export const initENV = () => {
  const env = schema.parse({
    ...process.env,
  });

  return {
    ...env,

    // DATABASE
    POSTGRES_CONNECTION_STRING: `postgresql://${env.POSTGRES_USER}:${env.POSTGRES_PASS}@${env.POSTGRES_HOST}:${env.POSTGRES_PORT}/${env.POSTGRES_NAME}`,

    // QUEUE
    REDIS_CONNECTION_STRING: `redis://:${encodeURIComponent(env.REDIS_PASSWORD)}@${env.REDIS_HOST}:${env.REDIS_PORT}`,

    // ASSETS — the marketing site (served at the client origin's root) hosts /logo.png
    LOGO_URL: new URL("/logo.png", env.CLIENT_URL).toString(),

    // NODE ENV
    IS_DEVELOPMENT: env.NODE_ENV === "development",
    IS_PRODUCTION: env.NODE_ENV === "production",
    IS_TEST: env.NODE_ENV === "test",
  };
};

export type ENV = Awaited<ReturnType<typeof initENV>>;

import { z } from "zod";
import { config } from "dotenv";

config({
  path: "../../.env",
});

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

// Platforms like Dockploy keep unset keys as empty strings.
const optional = <T extends z.ZodType>(type: T) =>
  z.preprocess(emptyToUndefined, type.optional());

const baseSchema = z.object({
  // APP
  NODE_ENV: z.enum(["development", "production", "test"]),

  // API
  API_PORT: z.coerce.number().int().positive(),
  VITE_API_URL: z.url(),
  VITE_SENTRY_DSN: z.url().optional(),

  // CLIENT
  CLIENT_URL: z.url(),

  // AUTH
  BETTER_AUTH_SECRET: z.string().min(32),

  // Database: either POSTGRES_URL or all of the individual POSTGRES_* keys
  POSTGRES_URL: optional(z.url({ protocol: /^postgres(ql)?$/ })),
  POSTGRES_HOST: optional(z.string()),
  POSTGRES_PORT: optional(z.coerce.number().int().positive()),
  POSTGRES_USER: optional(z.string()),
  POSTGRES_PASS: optional(z.string()),
  POSTGRES_NAME: optional(z.string()),

  // Queue: either REDIS_URL or all of the individual REDIS_* keys
  REDIS_URL: optional(z.url({ protocol: /^rediss?$/ })),
  REDIS_HOST: optional(z.string()),
  REDIS_PORT: optional(z.coerce.number().int().positive()),
  REDIS_PASSWORD: optional(z.string()),
  RATE_LIMIT_KEY_SECRET: z.string().min(32),
  TRUST_PROXY: z.stringbool().default(false),
  QUEUE_CONCURRENCY: z.coerce.number().int().positive().default(5),
  QUEUE_BACKLOG_THRESHOLD: z.coerce.number().int().positive().default(100),

  // Mail
  RESEND_API_KEY: z.string().nonempty(),
  MAIL_DOMAIN: z.string().nonempty(),
  MAIL_RATE_LIMIT_PER_SECOND: z.coerce.number().positive().default(2),

  // Lets e2e tests script what Skool returns; anything unscripted still reaches Skool
  SKOOL_SCRIPTING: z.stringbool().default(false),

  // AI filter: without a key it cannot classify leads, everything else works
  OPENAI_API_KEY: optional(z.string()),
  AI_FILTER_MODEL: z.string().nonempty().default("gpt-5-mini"),

  // Error monitoring (Sentry-compatible, e.g. Bugsink) — optional
  SENTRY_DSN: z.url().optional(),
});

type BaseEnv = z.infer<typeof baseSchema>;

const reportMissing = (
  ctx: z.core.$RefinementCtx<BaseEnv>,
  alternative: string,
  values: Record<string, unknown>,
) => {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      ctx.addIssue({
        code: "custom",
        message: `${key} is required unless ${alternative} is set`,
        path: [key],
      });
    }
  }

  return z.NEVER;
};

const resolvePostgres = (env: BaseEnv, ctx: z.core.$RefinementCtx<BaseEnv>) => {
  if (env.POSTGRES_URL) return env.POSTGRES_URL;

  const host = env.POSTGRES_HOST;
  const port = env.POSTGRES_PORT;
  const user = env.POSTGRES_USER;
  const pass = env.POSTGRES_PASS;
  const name = env.POSTGRES_NAME;

  if (host && port && user && pass && name) {
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${name}`;
  }

  return reportMissing(ctx, "POSTGRES_URL", {
    POSTGRES_HOST: host,
    POSTGRES_PORT: port,
    POSTGRES_USER: user,
    POSTGRES_PASS: pass,
    POSTGRES_NAME: name,
  });
};

const resolveRedis = (env: BaseEnv, ctx: z.core.$RefinementCtx<BaseEnv>) => {
  if (env.REDIS_URL) return env.REDIS_URL;

  const host = env.REDIS_HOST;
  const port = env.REDIS_PORT;
  const password = env.REDIS_PASSWORD;

  if (host && port && password) {
    return `redis://:${encodeURIComponent(password)}@${host}:${port}`;
  }

  return reportMissing(ctx, "REDIS_URL", {
    REDIS_HOST: host,
    REDIS_PORT: port,
    REDIS_PASSWORD: password,
  });
};

const schema = baseSchema.transform((env, ctx) => ({
  ...env,
  POSTGRES_CONNECTION_STRING: resolvePostgres(env, ctx),
  REDIS_CONNECTION_STRING: resolveRedis(env, ctx),
}));

export const initENV = () => {
  const env = schema.parse({
    ...process.env,
  });

  return {
    ...env,

    // ASSETS — the marketing site (served at the client origin's root) hosts /logo.png
    LOGO_URL: new URL("/logo.png", env.CLIENT_URL).toString(),

    // NODE ENV
    IS_DEVELOPMENT: env.NODE_ENV === "development",
    IS_PRODUCTION: env.NODE_ENV === "production",
    IS_TEST: env.NODE_ENV === "test",
  };
};

export type ENV = Awaited<ReturnType<typeof initENV>>;

if (import.meta.main) initENV();

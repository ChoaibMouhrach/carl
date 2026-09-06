import { initDB } from "./infrastructure/database/client";
import { PinoLogger } from "./infrastructure/logger/pino";
import { initENV } from "./config/env";
import { Repositories } from "./repositories";
import type { BaseLogger } from "./lib/base-logger";
import type { BaseMailer } from "./lib/base-mailer";
import { DevMailer } from "./infrastructure/mailer/dev";
import { ResendMailer } from "./infrastructure/mailer/resend";
import { RateLimitedMailer } from "./infrastructure/mailer/rate-limited";
import type { BaseStorage } from "./lib/base-storage";
import { S3Storage } from "./infrastructure/storage/s3";
import type { BaseBilling } from "./lib/base-billing";
import { StripeBilling } from "./infrastructure/billing/stripe";
import type { BaseQueueHub } from "./lib/base-queue";
import { QueueHub } from "./infrastructure/queue/bullmq";
import type { BaseRateLimiter } from "./lib/base-rate-limiter";
import { RedisRateLimiter } from "./infrastructure/rate-limiter/redis";
import { DisabledRateLimiter } from "./infrastructure/rate-limiter/disabled";
import { createAuth } from "./infrastructure/auth";
import type { BaseErrorMonitor } from "./lib/base-error-monitor";
import { DisabledErrorMonitor } from "./infrastructure/error-monitor/disabled";
import { SentryErrorMonitor } from "./infrastructure/error-monitor/sentry";
import type { BaseEmbeddings } from "./lib/base-embeddings";
import { OpenAIEmbeddings } from "./infrastructure/embeddings/openai";

export const initContext = async () => {
  const logger: BaseLogger = new PinoLogger();

  const env = initENV();

  const errorMonitor: BaseErrorMonitor = env.SENTRY_DSN
    ? new SentryErrorMonitor({
        dsn: env.SENTRY_DSN,
        environment: env.NODE_ENV,
      })
    : new DisabledErrorMonitor();

  const dbConnection = await initDB({
    connectionCredentials: env.POSTGRES_CONNECTION_STRING,
  });

  if (env.IS_PRODUCTION) {
    logger.info("Running database migrations...");
    await dbConnection.migrate();
    logger.info("Database migrations complete");
  }

  const repositories = new Repositories({
    dbConnection: dbConnection,
  });

  const baseMailer: BaseMailer = env.IS_PRODUCTION
    ? new ResendMailer({
        apiKey: env.RESEND_API_KEY,
        domain: env.MAIL_DOMAIN,
      })
    : new DevMailer({
        logger,
      });

  const mailer: BaseMailer = env.IS_DEVELOPMENT
    ? baseMailer
    : new RateLimitedMailer({
        intervalMs: 1_000 / env.MAIL_RATE_LIMIT_PER_SECOND,
        mailer: baseMailer,
      });

  const storage: BaseStorage = new S3Storage({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
    bucket: env.S3_BUCKET_NAME,
    publicUrl: env.S3_PUBLIC_URL,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  });

  const queueHub: BaseQueueHub = new QueueHub({
    concurrency: env.QUEUE_CONCURRENCY,
    errorMonitor,
    logger,
    redisUrl: env.REDIS_CONNECTION_STRING,
  });

  const rateLimiter: BaseRateLimiter = env.IS_DEVELOPMENT
    ? new DisabledRateLimiter()
    : new RedisRateLimiter({
        keySecret: env.RATE_LIMIT_KEY_SECRET,
        redisUrl: env.REDIS_CONNECTION_STRING,
      });

  const auth = createAuth({ db: dbConnection.db, env, queueHub });

  const billing: BaseBilling = new StripeBilling({
    cancelUrl: new URL("/app/user/select-plan", env.CLIENT_URL).toString(),
    portalReturnUrl: new URL("/app/user/billing", env.CLIENT_URL).toString(),
    secretKey: env.STRIPE_SECRET_KEY,
    successUrl: new URL("/app/user/select-plan", env.CLIENT_URL).toString(),
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
  });

  const embeddings: BaseEmbeddings = new OpenAIEmbeddings({
    apiKey: env.OPENAI_API_KEY,
  });

  return {
    billing,
    repositories,
    storage,
    queueHub,
    rateLimiter,
    logger,
    mailer,
    env,
    auth,
    errorMonitor,
    embeddings,
  };
};

export type Context = Awaited<ReturnType<typeof initContext>>;

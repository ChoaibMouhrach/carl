import { initDB } from "./infrastructure/database/client";
import { PinoLogger } from "./infrastructure/logger/pino";
import { initENV } from "./config/env";
import { Repositories } from "./repositories";
import type { BaseLogger } from "./lib/base-logger";
import type { BaseMailer } from "./lib/base-mailer";
import { DevMailer } from "./infrastructure/mailer/dev";
import { ResendMailer } from "./infrastructure/mailer/resend";
import type { BaseStorage } from "./lib/base-storage";
import { S3rverStorage } from "./infrastructure/storage/s3rver";
import { S3Storage } from "./infrastructure/storage/s3";
import type { BaseBilling } from "./lib/base-billing";
import { StripeBilling } from "./infrastructure/billing/stripe";
import { DisabledBilling } from "./infrastructure/billing/disabled";
import type { BaseQueueHub } from "./lib/base-queue";
import { QueueHub } from "./infrastructure/queue/bullmq";
import type { BaseRateLimiter } from "./lib/base-rate-limiter";
import { RedisRateLimiter } from "./infrastructure/rate-limiter/redis";

export const initContext = async () => {
  const logger: BaseLogger = new PinoLogger();

  const env = initENV();

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

  const mailer: BaseMailer = env.IS_PRODUCTION
    ? new ResendMailer({
        apiKey: env.RESEND_API_KEY,
        domain: env.MAIL_DOMAIN,
      })
    : new DevMailer({
        logger,
      });

  const storage: BaseStorage = env.IS_PRODUCTION
    ? new S3Storage({
        endpoint: env.S3_ENDPOINT,
        region: env.S3_REGION,
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
        bucket: env.S3_BUCKET_NAME,
        publicUrl: env.S3_PUBLIC_URL,
      })
    : new S3rverStorage();

  const queueHub: BaseQueueHub = new QueueHub({
    concurrency: env.QUEUE_CONCURRENCY,
    logger,
    mailer,
    redisUrl: env.REDIS_CONNECTION_STRING,
  });

  const rateLimiter: BaseRateLimiter = new RedisRateLimiter({
    keySecret: env.RATE_LIMIT_KEY_SECRET,
    redisUrl: env.REDIS_CONNECTION_STRING,
  });

  const billing: BaseBilling =
    env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET
      ? new StripeBilling({
          cancelUrl: new URL(
            "/app/user/select-plan",
            env.CLIENT_URL,
          ).toString(),
          portalReturnUrl: new URL(
            "/app/user/billing",
            env.CLIENT_URL,
          ).toString(),
          secretKey: env.STRIPE_SECRET_KEY,
          successUrl: new URL(
            "/app/user/select-plan",
            env.CLIENT_URL,
          ).toString(),
          webhookSecret: env.STRIPE_WEBHOOK_SECRET,
        })
      : new DisabledBilling();

  return {
    billing,
    repositories,
    storage,
    queueHub,
    rateLimiter,
    logger,
    mailer,
    env,
  };
};

export type Context = Awaited<ReturnType<typeof initContext>>;

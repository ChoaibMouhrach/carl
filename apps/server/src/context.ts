import { initDB } from "./infrastructure/database/client";
import { createPinoLogger } from "./infrastructure/logger/pino";
import { initENV } from "./config/env";
import {
  DEFAULT_SKOOL_SEARCHES,
  EVENT_STREAM_HEARTBEAT_MS,
} from "./config/constants";
import { Repositories } from "./repositories";
import type { BaseLogger } from "./lib/base-logger";
import type { BaseMailer } from "./lib/base-mailer";
import { DevMailer } from "./infrastructure/mailer/dev";
import { ResendMailer } from "./infrastructure/mailer/resend";
import { RateLimitedMailer } from "./infrastructure/mailer/rate-limited";
import type { BaseEventBus } from "./lib/base-event-bus";
import { RedisEventBus } from "./infrastructure/event-bus/redis";
import type { BaseQueueHub } from "./lib/base-queue";
import { QueueHub } from "./infrastructure/queue/bullmq";
import type { BaseLeadClassifier } from "./lib/base-lead-classifier";
import { LlmLeadClassifier } from "./infrastructure/ai/llm-classifier";
import { createLlm } from "./infrastructure/llm";
import { ScriptedLeadClassifier } from "./infrastructure/ai/scripted";
import type { BaseWebSearch } from "./lib/base-web-search";
import { TavilyWebSearch } from "./infrastructure/search/tavily";
import { ScriptedWebSearch } from "./infrastructure/search/scripted";
import type { BaseCache } from "./lib/base-cache";
import { RedisCache } from "./infrastructure/cache/redis";
import type { BaseRateLimiter } from "./lib/base-rate-limiter";
import { RedisRateLimiter } from "./infrastructure/rate-limiter/redis";
import { DisabledRateLimiter } from "./infrastructure/rate-limiter/disabled";
import { createAuth } from "./infrastructure/auth";
import type { BaseErrorMonitor } from "./lib/base-error-monitor";
import { DisabledErrorMonitor } from "./infrastructure/error-monitor/disabled";
import { SentryErrorMonitor } from "./infrastructure/error-monitor/sentry";
import type { BaseSkoolScraper } from "./lib/base-skool-scraper";
import { CustomSkoolScraper } from "./infrastructure/skool/custom";
import { ScriptedSkoolScraper } from "./infrastructure/skool/scripted";

export const initContext = async () => {
  const env = initENV();

  const logger: BaseLogger = await createPinoLogger({
    level: env.LOG_LEVEL,
    pretty: env.IS_DEVELOPMENT,
  });

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

  const queueHub: BaseQueueHub = new QueueHub({
    concurrency: env.QUEUE_CONCURRENCY,
    errorMonitor,
    logger,
    redisUrl: env.REDIS_CONNECTION_STRING,
  });

  const eventBus: BaseEventBus = new RedisEventBus({
    logger,
    redisUrl: env.REDIS_CONNECTION_STRING,
  });

  const cache: BaseCache = new RedisCache({
    logger,
    redisUrl: env.REDIS_CONNECTION_STRING,
  });

  const rateLimiter: BaseRateLimiter = env.IS_DEVELOPMENT
    ? new DisabledRateLimiter()
    : new RedisRateLimiter({
        keySecret: env.RATE_LIMIT_KEY_SECRET,
        redisUrl: env.REDIS_CONNECTION_STRING,
      });

  const customScraper = new CustomSkoolScraper();
  const skoolScraper: BaseSkoolScraper = env.SKOOL_SCRIPTING
    ? new ScriptedSkoolScraper({
        fallback: customScraper,
        redisUrl: env.REDIS_CONNECTION_STRING,
      })
    : customScraper;

  const leadClassifier: BaseLeadClassifier = env.SKOOL_SCRIPTING
    ? new ScriptedLeadClassifier({ redisUrl: env.REDIS_CONNECTION_STRING })
    : new LlmLeadClassifier({ llm: createLlm(env) });

  const webSearch: BaseWebSearch = env.SKOOL_SCRIPTING
    ? new ScriptedWebSearch({ redisUrl: env.REDIS_CONNECTION_STRING })
    : new TavilyWebSearch({ apiKey: env.TAVILY_API_KEY });

  const auth = createAuth({ db: dbConnection.db, env, queueHub });

  return {
    repositories,
    queueHub,
    eventBus,
    cache,
    rateLimiter,
    logger,
    mailer,
    env,
    auth,
    errorMonitor,
    skoolScraper,
    leadClassifier,
    webSearch,
    eventStreamHeartbeatMs: EVENT_STREAM_HEARTBEAT_MS,
    discoveryCriteria: DEFAULT_SKOOL_SEARCHES,
  };
};

export type Context = Awaited<ReturnType<typeof initContext>>;

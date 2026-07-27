import { createHmac } from "crypto";
import { rateLimiter } from "hono-rate-limiter";
import IORedis from "ioredis";
import { RedisStore } from "rate-limit-redis";
import z from "zod";
import type { Context, Env, MiddlewareHandler } from "hono";
import type { AppContext, AuthAppContext } from "@server/app";
import { BaseRateLimiter } from "@server/lib/base-rate-limiter";

type RedisReply = boolean | number | string | Array<boolean | number | string>;

const emailRequestSchema = z.object({
  email: z.string(),
});

interface RateLimitPolicy<E extends Env> {
  key: (context: Context<E>) => Promise<string> | string;
  limit: number;
  name: string;
  skip?: (context: Context<E>) => Promise<boolean> | boolean;
  windowMs: number;
}

interface RedisRateLimiterInit {
  keySecret: string;
  redisUrl: string;
}

class HonoRedisStore {
  private store: RedisStore;

  public constructor(init: {
    sendCommand: (...command: string[]) => Promise<RedisReply>;
    prefix: string;
  }) {
    this.store = new RedisStore(init);
  }

  public decrement(key: string): Promise<void> {
    return this.store.decrement(key);
  }

  public async get(
    key: string,
  ): Promise<{ resetTime?: Date; totalHits: number } | undefined> {
    const result = await this.store.get(key);

    if (!result) return undefined;

    return {
      resetTime: result.resetTime,
      totalHits: result.totalHits,
    };
  }

  public increment(
    key: string,
  ): Promise<{ resetTime?: Date; totalHits: number }> {
    return this.store.increment(key);
  }

  public init(input: { windowMs: number }): void {
    this.store.windowMs = input.windowMs;
    this.store.incrementScriptSha = this.store.loadIncrementScript();
    this.store.getScriptSha = this.store.loadGetScript();
  }

  public resetKey(key: string): Promise<void> {
    return this.store.resetKey(key);
  }
}

const isRedisReply = (value: unknown): value is RedisReply => {
  if (
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return true;
  }

  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "boolean" ||
        typeof item === "number" ||
        typeof item === "string",
    )
  );
};

const getClientIp = <E extends AppContext>(context: Context<E>): string => {
  const env = context.get("context").env;

  if (!env.TRUST_PROXY) {
    return context.env?.clientIp ?? "unknown";
  }

  const cloudflareIp = context.req.header("cf-connecting-ip");

  if (cloudflareIp) return cloudflareIp;

  const forwardedFor = context.req.header("x-forwarded-for");
  const clientIp = forwardedFor?.split(",")[0]?.trim();

  return clientIp || "unknown";
};

export class RedisRateLimiter extends BaseRateLimiter {
  public anonymous: MiddlewareHandler<AppContext>;
  public authEmail: MiddlewareHandler<AppContext>;
  public authIp: MiddlewareHandler<AppContext>;
  public authenticated: MiddlewareHandler<AuthAppContext>;
  public billing: MiddlewareHandler<AuthAppContext>;
  public platformSetup: MiddlewareHandler<AppContext>;
  public storage: MiddlewareHandler<AuthAppContext>;
  private client: IORedis;
  private keySecret: string;

  public constructor(init: RedisRateLimiterInit) {
    super();

    this.client = new IORedis(init.redisUrl, {
      maxRetriesPerRequest: null,
    });
    this.keySecret = init.keySecret;

    this.anonymous = this.createMiddleware<AppContext>({
      key: getClientIp,
      limit: 120,
      name: "anonymous",
      skip: (context) => context.req.path === "/api/billing/webhooks/stripe",
      windowMs: 60_000,
    });
    this.authIp = this.createMiddleware<AppContext>({
      key: getClientIp,
      limit: 10,
      name: "auth-ip",
      windowMs: 15 * 60_000,
    });
    this.authEmail = this.createMiddleware<AppContext>({
      key: async (context) => {
        let body: unknown = null;

        try {
          body = await context.req.raw.clone().json();
        } catch {
          return "invalid";
        }
        const email = this.getEmail(body);

        return email ? this.hash(email) : "invalid";
      },
      limit: 5,
      name: "auth-email",
      windowMs: 15 * 60_000,
    });
    this.authenticated = this.createMiddleware<AuthAppContext>({
      key: (context) => `user:${context.get("auth").user.userId}`,
      limit: 300,
      name: "authenticated",
      windowMs: 60_000,
    });
    this.billing = this.createMiddleware<AuthAppContext>({
      key: (context) => `user:${context.get("auth").user.userId}`,
      limit: 10,
      name: "billing",
      windowMs: 10 * 60_000,
    });
    this.storage = this.createMiddleware<AuthAppContext>({
      key: (context) => `user:${context.get("auth").user.userId}`,
      limit: 30,
      name: "storage",
      windowMs: 60_000,
    });
    this.platformSetup = this.createMiddleware<AppContext>({
      key: getClientIp,
      limit: 5,
      name: "platform-setup",
      windowMs: 60 * 60_000,
    });
  }

  public override async ping(): Promise<void> {
    await this.client.ping();
  }

  public override async close(): Promise<void> {
    await this.client.quit();
  }

  private createMiddleware<E extends Env>(
    policy: RateLimitPolicy<E>,
  ): MiddlewareHandler<E> {
    return rateLimiter<E>({
      keyGenerator: policy.key,
      limit: policy.limit,
      message: {
        message: "Too many requests. Please try again later.",
        statusCode: 429,
      },
      standardHeaders: "draft-7",
      store: new HonoRedisStore({
        prefix: `rate-limit:v1:${policy.name}:`,
        sendCommand: async (...command) => {
          const [name, ...arguments_] = command;

          if (!name) {
            throw new Error("Redis command name is required.");
          }

          const result = await this.client.call(name, ...arguments_);

          if (isRedisReply(result)) return result;

          throw new Error("Unexpected Redis response for rate limiter.");
        },
      }),
      ...(policy.skip ? { skip: policy.skip } : {}),
      windowMs: policy.windowMs,
    });
  }

  private getEmail(body: unknown): string | null {
    const result = emailRequestSchema.safeParse(body);

    return result.success ? result.data.email.trim().toLowerCase() : null;
  }

  private hash(value: string): string {
    return createHmac("sha256", this.keySecret).update(value).digest("hex");
  }
}

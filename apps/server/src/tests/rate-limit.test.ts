import { afterEach, expect, test } from "bun:test";
import IORedis from "ioredis";
import { initApp } from "@server/app";
import { initENV } from "@server/config/env";
import { checkoutAttemptsTable } from "@server/infrastructure/database/schemas";
import { RedisRateLimiter } from "@server/infrastructure/rate-limiter/redis";
import { createContext } from "./helpers/billing";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";

const rateLimitKeyPattern = "rate-limit:v1:*";
const activeLimiters: RedisRateLimiter[] = [];

const createLimiter = () => {
  const env = initENV();
  const limiter = new RedisRateLimiter({
    keySecret: env.RATE_LIMIT_KEY_SECRET,
    redisUrl: env.REDIS_CONNECTION_STRING,
  });

  activeLimiters.push(limiter);

  return limiter;
};

const clearRateLimits = async () => {
  const env = initENV();
  const redis = new IORedis(env.REDIS_CONNECTION_STRING);

  try {
    const keys = await redis.keys(rateLimitKeyPattern);

    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } finally {
    await redis.quit();
  }
};

afterEach(async () => {
  await clearRateLimits();

  while (activeLimiters.length > 0) {
    const limiter = activeLimiters.pop();

    if (limiter) {
      await limiter.close();
    }
  }
});

test("auth limits are shared through Redis across app instances and keyed by email", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const env = initENV();
    const firstLimiter = createLimiter();
    const secondLimiter = createLimiter();
    const firstApp = await initApp({
      context: createContext(db, pool, env, undefined, undefined, firstLimiter),
    });
    const secondApp = await initApp({
      context: createContext(
        db,
        pool,
        env,
        undefined,
        undefined,
        secondLimiter,
      ),
    });
    const request = {
      body: JSON.stringify({
        email: "shared@example.com",
        password: "password-that-is-long-enough",
      }),
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": "203.0.113.10",
      },
      method: "POST",
    };

    for (let index = 0; index < 5; index += 1) {
      const response = await firstApp.request("/api/auth/sign-in", request);

      expect(response.status).toBe(401);
    }

    const differentEmail = await firstApp.request("/api/auth/sign-in", {
      ...request,
      body: JSON.stringify({
        email: "different@example.com",
        password: "password-that-is-long-enough",
      }),
    });

    const limited = await secondApp.request("/api/auth/sign-in", request);

    expect(differentEmail.status).toBe(401);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("RateLimit")).not.toBeNull();
    expect(limited.headers.get("Retry-After")).not.toBeNull();
  });
});

test("auth email limits remain atomic during concurrent credential stuffing", async () => {
  await withTestDatabase(async ({ context }) => {
    context.rateLimiter = createLimiter();
    const app = await initApp({ context });
    const request = {
      body: JSON.stringify({
        email: "concurrent@example.com",
        password: "password-that-is-long-enough",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    };
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        app.request("/api/auth/sign-in", request),
      ),
    );

    expect(
      responses.filter((response) => response.status === 401),
    ).toHaveLength(5);
    expect(
      responses.filter((response) => response.status === 429),
    ).toHaveLength(5);
  });
});

test("auth email limits normalize casing before creating a key", async () => {
  await withTestDatabase(async ({ context }) => {
    context.rateLimiter = createLimiter();
    const app = await initApp({ context });

    for (let index = 0; index < 5; index += 1) {
      const response = await app.request("/api/auth/sign-in", {
        body: JSON.stringify({
          email: "CaseSensitive@Example.com",
          password: "password-that-is-long-enough",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      expect(response.status).toBe(401);
    }

    const limited = await app.request("/api/auth/sign-in", {
      body: JSON.stringify({
        email: "casesensitive@example.com",
        password: "password-that-is-long-enough",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(limited.status).toBe(429);
  });
});

test("auth email rate-limit keys never expose the email address", async () => {
  await withTestDatabase(async ({ context }) => {
    const env = initENV();
    context.rateLimiter = createLimiter();
    const app = await initApp({ context });
    const email = "private@example.com";

    const response = await app.request("/api/auth/sign-in", {
      body: JSON.stringify({
        email,
        password: "password-that-is-long-enough",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const redis = new IORedis(env.REDIS_CONNECTION_STRING);

    try {
      const keys = await redis.keys(rateLimitKeyPattern);

      expect(response.status).toBe(401);
      expect(keys.some((key) => key.includes(email))).toBeFalse();
    } finally {
      await redis.quit();
    }
  });
});

test("auth IP limits use trusted proxy headers without grouping different clients", async () => {
  await withTestDatabase(async ({ context }) => {
    context.env.TRUST_PROXY = true;
    context.rateLimiter = createLimiter();
    const app = await initApp({ context });

    for (let index = 0; index < 10; index += 1) {
      const response = await app.request("/api/auth/forget-password", {
        body: JSON.stringify({ email: `ip-${index}@example.com` }),
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": "203.0.113.20",
        },
        method: "POST",
      });

      expect(response.status).toBe(204);
    }

    const limited = await app.request("/api/auth/forget-password", {
      body: JSON.stringify({ email: "another@example.com" }),
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": "203.0.113.20",
      },
      method: "POST",
    });
    const otherClient = await app.request("/api/auth/forget-password", {
      body: JSON.stringify({ email: "other-client@example.com" }),
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": "203.0.113.21",
      },
      method: "POST",
    });

    expect(limited.status).toBe(429);
    expect(otherClient.status).toBe(204);
  });
});

test("forwarded headers cannot bypass auth limits when proxy trust is disabled", async () => {
  await withTestDatabase(async ({ context }) => {
    context.rateLimiter = createLimiter();
    const app = await initApp({ context });

    for (let index = 0; index < 10; index += 1) {
      const response = await app.request("/api/auth/forget-password", {
        body: JSON.stringify({ email: `spoof-${index}@example.com` }),
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": `203.0.113.${index + 1}`,
        },
        method: "POST",
      });

      expect(response.status).toBe(204);
    }

    const limited = await app.request("/api/auth/forget-password", {
      body: JSON.stringify({ email: "spoof-limited@example.com" }),
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": "203.0.113.200",
      },
      method: "POST",
    });

    expect(limited.status).toBe(429);
  });
});

test("malformed auth payloads still consume the IP limit", async () => {
  await withTestDatabase(async ({ context }) => {
    context.rateLimiter = createLimiter();
    const app = await initApp({ context });

    for (let index = 0; index < 10; index += 1) {
      const response = await app.request("/api/auth/sign-in", {
        body: "{",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      expect(response.status).toBe(400);
    }

    const limited = await app.request("/api/auth/sign-in", {
      body: "{",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(limited.status).toBe(429);
  });
});

test("billing limits isolate users and reject checkout before it writes to the database", async () => {
  await withTestDatabase(async ({ context, db }) => {
    context.rateLimiter = createLimiter();
    const first = await createAuthenticatedApp({
      context,
      email: "billing-first@example.com",
    });
    const second = await createAuthenticatedApp({
      context,
      email: "billing-second@example.com",
    });

    for (let index = 0; index < 10; index += 1) {
      const response = await first.app.request("/api/billing/portal", {
        headers: { Cookie: first.cookie },
        method: "POST",
      });

      expect(response.status).toBe(404);
    }

    const before = await db.select().from(checkoutAttemptsTable);
    const limited = await first.app.request("/api/billing/checkout", {
      body: JSON.stringify({
        billingInterval: "monthly",
        planKey: "starter",
      }),
      headers: {
        "Content-Type": "application/json",
        Cookie: first.cookie,
      },
      method: "POST",
    });
    const after = await db.select().from(checkoutAttemptsTable);
    const secondUser = await second.app.request("/api/billing/portal", {
      headers: { Cookie: second.cookie },
      method: "POST",
    });

    expect(limited.status).toBe(429);
    expect(after).toEqual(before);
    expect(secondUser.status).toBe(404);
  });
});

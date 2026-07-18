import { createMiddleware } from "hono/factory";
import type { AppContext, AuthAppContext } from "@server/app";

export const anonymousRateLimit = createMiddleware<AppContext>(
  async (context, next) => {
    return await context.get("context").rateLimiter.anonymous(context, next);
  },
);

export const authEmailRateLimit = createMiddleware<AppContext>(
  async (context, next) => {
    return await context.get("context").rateLimiter.authEmail(context, next);
  },
);

export const authIpRateLimit = createMiddleware<AppContext>(
  async (context, next) => {
    return await context.get("context").rateLimiter.authIp(context, next);
  },
);

export const billingRateLimit = createMiddleware<AuthAppContext>(
  async (context, next) => {
    return await context.get("context").rateLimiter.billing(context, next);
  },
);

export const platformSetupRateLimit = createMiddleware<AppContext>(
  async (context, next) => {
    return await context
      .get("context")
      .rateLimiter.platformSetup(context, next);
  },
);

export const storageRateLimit = createMiddleware<AuthAppContext>(
  async (context, next) => {
    return await context.get("context").rateLimiter.storage(context, next);
  },
);

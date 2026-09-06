import type { MiddlewareHandler } from "hono";
import type { AppContext, AuthAppContext } from "@server/app";
import { BaseRateLimiter } from "@server/lib/base-rate-limiter";

export class DisabledRateLimiter extends BaseRateLimiter {
  public anonymous: MiddlewareHandler<AppContext> = async (_c, next) => next();
  public authEmail: MiddlewareHandler<AppContext> = async (_c, next) => next();
  public authIp: MiddlewareHandler<AppContext> = async (_c, next) => next();
  public authenticated: MiddlewareHandler<AuthAppContext> = async (_c, next) =>
    next();
  public billing: MiddlewareHandler<AuthAppContext> = async (_c, next) =>
    next();
  public platformSetup: MiddlewareHandler<AppContext> = async (_c, next) =>
    next();
  public storage: MiddlewareHandler<AuthAppContext> = async (_c, next) =>
    next();

  public async ping() {}

  public async close() {}
}

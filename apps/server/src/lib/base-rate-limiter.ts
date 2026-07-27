import type { MiddlewareHandler } from "hono";
import type { AppContext, AuthAppContext } from "@server/app";

export abstract class BaseRateLimiter {
  public abstract anonymous: MiddlewareHandler<AppContext>;
  public abstract authEmail: MiddlewareHandler<AppContext>;
  public abstract authIp: MiddlewareHandler<AppContext>;
  public abstract authenticated: MiddlewareHandler<AuthAppContext>;
  public abstract billing: MiddlewareHandler<AuthAppContext>;
  public abstract platformSetup: MiddlewareHandler<AppContext>;
  public abstract storage: MiddlewareHandler<AuthAppContext>;

  public abstract ping(): Promise<void>;

  public abstract close(): Promise<void>;
}

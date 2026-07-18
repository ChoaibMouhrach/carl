import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { AuthAppContext } from "@server/app";
import { ForbiddenError, UnauthorizedError } from "@server/lib/errors";
import { AUTH_SESSION_COOKIE_NAME, type Role } from "@server/config/constants";

export const createAuthMiddleware = (role?: Role) => {
  return createMiddleware<AuthAppContext>(async (context, next) => {
    const cookie = getCookie(context, AUTH_SESSION_COOKIE_NAME);

    if (!cookie) {
      throw new UnauthorizedError({
        message: "Invalid session",
      });
    }

    const auth = await context.get("services").auth.me({ session: cookie });

    if (!!role && role !== auth.user.role) {
      throw new ForbiddenError();
    }

    context.set("auth", {
      user: {
        userId: auth.user.userId,
        email: auth.user.email,
        role: auth.user.role,
      },
      session: {
        sessionId: auth.session.sessionId,
        session: auth.session.session,
      },
    });

    return await context
      .get("context")
      .rateLimiter.authenticated(context, next);
  });
};

export const authMiddleware = createAuthMiddleware();
export const adminMiddleware = createAuthMiddleware("admin");

export const billingAccessMiddleware = createMiddleware<AuthAppContext>(
  async (context, next) => {
    const { user } = context.get("auth");

    if (user.role === "admin") {
      return next();
    }

    const { access } = await context
      .get("services")
      .billingAccess.check({ userId: user.userId });

    if (!access) {
      throw new ForbiddenError();
    }

    return next();
  },
);

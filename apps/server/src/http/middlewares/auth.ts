import { createMiddleware } from "hono/factory";
import type { AuthAppContext } from "@server/app";
import { ForbiddenError, UnauthorizedError } from "@server/lib/errors";
import type { Role } from "@server/config/constants";

export const createAuthMiddleware = (role?: Role) => {
  return createMiddleware<AuthAppContext>(async (context, next) => {
    const auth = await context.get("context").auth.api.getSession({
      headers: context.req.raw.headers,
    });

    if (!auth) {
      throw new UnauthorizedError({ message: "Invalid session" });
    }

    const authRole: Role = auth.user.role === "admin" ? "admin" : "user";

    if (!!role && role !== authRole) {
      throw new ForbiddenError();
    }

    context.set("auth", {
      user: {
        userId: auth.user.id,
        email: auth.user.email,
        role: authRole,
      },
      session: {
        sessionId: auth.session.id,
        session: auth.session.token,
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

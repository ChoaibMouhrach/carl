import {
  changePasswordSchema,
  changeEmailSchema,
  confirmEmailAddressSchema,
  forgetPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "../validations/auth";
import { Hono } from "hono";
import type { AppContext } from "@server/app";
import { authMiddleware } from "../middlewares/auth";
import { deleteCookie, setCookie } from "hono/cookie";
import { describeRoute, validator } from "hono-openapi";
import { AUTH_SESSION_COOKIE_NAME } from "@server/config/constants";
import { authEmailRateLimit, authIpRateLimit } from "../middlewares/rate-limit";

export const authController = new Hono<AppContext>()
  .post(
    "/sign-in",
    describeRoute({ tags: ["auth"] }),
    authIpRateLimit,
    validator("json", signInSchema),
    authEmailRateLimit,
    async (context) => {
      const { env } = context.get("context");
      const body = context.req.valid("json");

      const { user, session, lifeTimeMS } = await context
        .get("services")
        .auth.signIn({
          email: body.email,
          password: body.password,
        });

      setCookie(context, AUTH_SESSION_COOKIE_NAME, session, {
        httpOnly: env.IS_PRODUCTION || env.IS_TEST,
        secure: env.IS_PRODUCTION || env.IS_TEST,
        sameSite: "Strict",
        path: "/",
        maxAge: Math.floor(lifeTimeMS / 1000),
      });

      return context.json({ user });
    },
  )

  .post(
    "/forget-password",
    describeRoute({ tags: ["auth"] }),
    authIpRateLimit,
    validator("json", forgetPasswordSchema),
    authEmailRateLimit,
    async (context) => {
      const body = context.req.valid("json");

      await context.get("services").auth.forgetPassword({
        email: body.email,
      });

      return context.body(null, 204);
    },
  )

  .post(
    "/reset-password",
    describeRoute({ tags: ["auth"] }),
    authIpRateLimit,
    validator("json", resetPasswordSchema),
    async (context) => {
      const body = context.req.valid("json");

      await context.get("services").auth.resetPassword({
        password: body.password,
        token: body.token,
      });

      return context.body(null, 204);
    },
  )

  .post(
    "/sign-up",
    describeRoute({ tags: ["auth"] }),
    authIpRateLimit,
    validator("json", signUpSchema),
    authEmailRateLimit,
    async (context) => {
      const body = context.req.valid("json");

      await context.get("services").auth.signUp({
        email: body.email,
        password: body.password,
      });

      return context.body(null, 204);
    },
  )

  .get(
    "/verify-email-address",
    describeRoute({ tags: ["auth"] }),
    validator("query", confirmEmailAddressSchema),
    async (context) => {
      const query = context.req.valid("query");

      await context.get("services").auth.verifyEmailAddress({
        token: query.token,
      });

      return context.body(null, 204);
    },
  )

  .use(authMiddleware)

  .get("/me", describeRoute({ tags: ["auth"] }), async (context) => {
    const user = context.get("auth").user;
    const billing = context.get("services").billing;
    const [{ needsOnboarding }, { subscription }] = await Promise.all([
      billing.getOnboarding({ userId: user.userId }),
      billing.getSubscription({ userId: user.userId }),
    ]);

    return context.json({
      user: {
        userId: user.userId,
        email: user.email,
        role: user.role,
      },
      needsOnboarding,
      subscription,
    });
  })

  .post("/sign-out", describeRoute({ tags: ["auth"] }), async (context) => {
    await context.get("services").auth.signOut({
      session: context.get("auth").session.session,
    });

    deleteCookie(context, AUTH_SESSION_COOKIE_NAME);

    return context.body(null, 204);
  })

  .post(
    "/change-email",
    describeRoute({ tags: ["auth"] }),
    validator("json", changeEmailSchema),
    async (context) => {
      const { email } = context.req.valid("json");
      const { userId } = context.get("auth").user;

      await context.get("services").auth.changeEmail({ email, userId });

      return context.body(null, 204);
    },
  )

  .post(
    "/change-password",
    describeRoute({ tags: ["auth"] }),
    validator("json", changePasswordSchema),
    async (context) => {
      const body = context.req.valid("json");
      const {
        user,
        session: { sessionId },
      } = context.get("auth");

      await context.get("services").auth.changePassword({
        currentPassword: body.currentPassword,
        newPassword: body.newPassword,
        revokeOtherSessions: body.revokeOtherSessions,
        userId: user.userId,
        sessionId,
      });

      return context.body(null, 204);
    },
  );

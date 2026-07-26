import {
  createUserSchema,
  userIdParamSchema,
  userQuerySchema,
} from "../validations/user";
import { Hono } from "hono";
import type { AppContext } from "@server/app";
import { adminMiddleware } from "../middlewares/auth";
import { describeRoute, validator } from "hono-openapi";

export const userController = new Hono<AppContext>()
  .use(adminMiddleware)

  .get(
    "/",
    describeRoute({ tags: ["user"] }),
    validator("query", userQuerySchema),
    async (context) => {
      const query = context.req.valid("query");

      const { users, meta } = await context.get("services").user.list({
        page: query?.page,
        search: query?.search,
        role: query?.role,
        verification: query?.verification,
      });

      return context.json({
        users,
        meta: {
          lastPage: meta.lastPage,
          page: meta.page,
        },
      });
    },
  )

  .get(
    "/:userId",
    describeRoute({ tags: ["user"] }),
    validator("param", userIdParamSchema),
    async (context) => {
      const { userId } = context.req.valid("param");

      const { subscription, user } = await context.get("services").user.show({
        userId,
      });

      return context.json({
        subscription,
        user,
      });
    },
  )

  .post(
    "/:userId/auth/resend-verification",
    describeRoute({ tags: ["user"] }),
    validator("param", userIdParamSchema),
    async (context) => {
      const { userId } = context.req.valid("param");
      await context.get("services").user.resendVerification({ userId });

      return context.body(null, 204);
    },
  )

  .post(
    "/:userId/auth/resend-password-reset",
    describeRoute({ tags: ["user"] }),
    validator("param", userIdParamSchema),
    async (context) => {
      const { userId } = context.req.valid("param");
      await context.get("services").user.resendPasswordReset({ userId });

      return context.body(null, 204);
    },
  )

  .post(
    "/:userId/billing/cancel",
    describeRoute({ tags: ["user"] }),
    validator("param", userIdParamSchema),
    async (context) => {
      const { userId } = context.req.valid("param");

      await context.get("services").billing.cancelSubscription({ userId });

      return context.body(null, 204);
    },
  )

  .post(
    "/",
    describeRoute({ tags: ["user"] }),
    validator("json", createUserSchema),
    async (context) => {
      const body = context.req.valid("json");

      await context.get("services").user.create({
        email: body.email,
        password: body.password,
        role: body.role,
      });

      return context.body(null, 201);
    },
  )

  .delete(
    "/:userId",
    describeRoute({ tags: ["user"] }),
    validator("param", userIdParamSchema),
    async (context) => {
      const { userId } = context.req.valid("param");

      await context.get("services").user.remove({ userId });

      return context.body(null, 204);
    },
  );

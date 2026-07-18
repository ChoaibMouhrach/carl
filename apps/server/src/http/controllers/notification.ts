import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import type { AppContext } from "@server/app";
import { authMiddleware } from "@server/http/middlewares/auth";
import {
  notificationIdSchema,
  notificationListQuerySchema,
} from "../validations/notification";

export const notificationController = new Hono<AppContext>()
  .use(authMiddleware)
  .get(
    "/",
    describeRoute({ tags: ["notifications"] }),
    validator("query", notificationListQuerySchema),
    async (context) => {
      const { userId } = context.get("auth").user;
      const { cursor } = context.req.valid("query");
      const result = await context
        .get("services")
        .notification.list({ cursor, userId });

      return context.json(result);
    },
  )
  .get(
    "/unread-count",
    describeRoute({ tags: ["notifications"] }),
    async (context) => {
      const { userId } = context.get("auth").user;
      const result = await context
        .get("services")
        .notification.getUnreadCount({ userId });

      return context.json(result);
    },
  )
  .post(
    "/read-all",
    describeRoute({ tags: ["notifications"] }),
    async (context) => {
      const { userId } = context.get("auth").user;
      await context.get("services").notification.markAllRead({ userId });

      return context.body(null, 204);
    },
  )
  .post(
    "/:notificationId/read",
    describeRoute({ tags: ["notifications"] }),
    validator("param", notificationIdSchema),
    async (context) => {
      const { userId } = context.get("auth").user;
      const { notificationId } = context.req.valid("param");
      await context.get("services").notification.markRead({
        notificationId,
        userId,
      });

      return context.body(null, 204);
    },
  );

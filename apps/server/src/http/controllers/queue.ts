import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import type { AppContext } from "@server/app";
import { adminMiddleware } from "../middlewares/auth";
import {
  queueFailedQuerySchema,
  queueJobParamSchema,
  queueParamSchema,
} from "../validations/queue";

export const queueController = new Hono<AppContext>()
  .use(adminMiddleware)

  .get("/", describeRoute({ tags: ["queues"] }), async (context) => {
    const result = await context.get("services").queue.overview();

    return context.json(result);
  })

  .get(
    "/:queue/failed",
    describeRoute({ tags: ["queues"] }),
    validator("param", queueParamSchema),
    validator("query", queueFailedQuerySchema),
    async (context) => {
      const { queue } = context.req.valid("param");
      const query = context.req.valid("query");

      const result = await context.get("services").queue.listFailed({
        queue,
        page: query?.page ?? 1,
      });

      return context.json(result);
    },
  )

  .post(
    "/:queue/failed/retry-all",
    describeRoute({ tags: ["queues"] }),
    validator("param", queueParamSchema),
    async (context) => {
      const { queue } = context.req.valid("param");

      const result = await context.get("services").queue.retryAll({ queue });

      return context.json(result);
    },
  )

  .post(
    "/:queue/failed/:jobId/retry",
    describeRoute({ tags: ["queues"] }),
    validator("param", queueJobParamSchema),
    async (context) => {
      const { queue, jobId } = context.req.valid("param");

      await context.get("services").queue.retryJob({ queue, jobId });

      return context.body(null, 204);
    },
  )

  .delete(
    "/:queue/failed/:jobId",
    describeRoute({ tags: ["queues"] }),
    validator("param", queueJobParamSchema),
    async (context) => {
      const { queue, jobId } = context.req.valid("param");

      await context.get("services").queue.removeJob({ queue, jobId });

      return context.body(null, 204);
    },
  );

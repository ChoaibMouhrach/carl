import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import type { AppContext } from "@server/app";
import { adminMiddleware } from "../middlewares/auth";
import {
  communityBulkDeleteSchema,
  communityCreateSchema,
  communityListQuerySchema,
  communityParamSchema,
  communityUpdateSchema,
} from "../validations/communities";

export const communityController = new Hono<AppContext>()
  .use(adminMiddleware)

  .get(
    "/",
    describeRoute({ tags: ["communities"] }),
    validator("query", communityListQuerySchema),
    async (context) => {
      const query = context.req.valid("query");

      const result = await context.get("services").community.list(query);

      return context.json(result);
    },
  )

  .post(
    "/",
    describeRoute({ tags: ["communities"] }),
    validator("json", communityCreateSchema),
    async (context) => {
      const body = context.req.valid("json");

      const community = await context.get("services").community.create(body);

      return context.json(community, 201);
    },
  )

  .post(
    "/bulk-delete",
    describeRoute({ tags: ["communities"] }),
    validator("json", communityBulkDeleteSchema),
    async (context) => {
      const body = context.req.valid("json");

      const result = await context.get("services").community.removeMany(body);

      return context.json(result);
    },
  )

  .get(
    "/:communityId",
    describeRoute({ tags: ["communities"] }),
    validator("param", communityParamSchema),
    async (context) => {
      const { communityId } = context.req.valid("param");

      const community = await context
        .get("services")
        .community.get({ communityId });

      return context.json(community);
    },
  )

  .patch(
    "/:communityId",
    describeRoute({ tags: ["communities"] }),
    validator("param", communityParamSchema),
    validator("json", communityUpdateSchema),
    async (context) => {
      const { communityId } = context.req.valid("param");
      const body = context.req.valid("json");

      const community = await context
        .get("services")
        .community.update({ communityId }, body);

      return context.json(community);
    },
  )

  .delete(
    "/:communityId",
    describeRoute({ tags: ["communities"] }),
    validator("param", communityParamSchema),
    async (context) => {
      const { communityId } = context.req.valid("param");

      await context.get("services").community.remove({ communityId });

      return context.body(null, 204);
    },
  );

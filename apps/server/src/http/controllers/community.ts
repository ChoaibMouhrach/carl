import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import type { AppContext } from "@server/app";
import { adminMiddleware } from "../middlewares/auth";
import {
  communityIdParamSchema,
  communityQuerySchema,
  createCommunitySchema,
  updateCommunitySchema,
} from "../validations/community";

import { csvHeaders } from "../csv";

export const communityController = new Hono<AppContext>()
  .use(adminMiddleware)

  .get(
    "/",
    describeRoute({ tags: ["community"] }),
    validator("query", communityQuerySchema),
    async (context) => {
      const query = context.req.valid("query");

      const result = await context.get("services").community.list({
        page: query?.page,
        search: query?.search,
        pricingType: query?.pricingType,
        leadId: query?.leadId,
        minMembers: query?.minMembers,
        minRevenue: query?.minRevenue,
        sortBy: query?.sortBy,
        sortOrder: query?.sortOrder,
      });

      return context.json(result);
    },
  )

  .get(
    "/export",
    describeRoute({ tags: ["community"] }),
    validator("query", communityQuerySchema),
    async (context) => {
      const query = context.req.valid("query");

      const { csv, filename } = await context
        .get("services")
        .community.exportCsv({
          search: query?.search,
          pricingType: query?.pricingType,
          leadId: query?.leadId,
          minMembers: query?.minMembers,
          minRevenue: query?.minRevenue,
          sortBy: query?.sortBy,
          sortOrder: query?.sortOrder,
        });

      return context.body(csv, 200, csvHeaders(filename));
    },
  )

  .get(
    "/:communityId",
    describeRoute({ tags: ["community"] }),
    validator("param", communityIdParamSchema),
    async (context) => {
      const { communityId } = context.req.valid("param");

      const result = await context
        .get("services")
        .community.show({ communityId });

      return context.json(result);
    },
  )

  .post(
    "/",
    describeRoute({ tags: ["community"] }),
    validator("json", createCommunitySchema),
    async (context) => {
      const body = context.req.valid("json");

      const community = await context.get("services").community.create(body);

      return context.json({ community }, 201);
    },
  )

  .patch(
    "/:communityId",
    describeRoute({ tags: ["community"] }),
    validator("param", communityIdParamSchema),
    validator("json", updateCommunitySchema),
    async (context) => {
      const { communityId } = context.req.valid("param");
      const body = context.req.valid("json");

      const community = await context
        .get("services")
        .community.update({ communityId }, body);

      return context.json({ community });
    },
  )

  .delete(
    "/:communityId",
    describeRoute({ tags: ["community"] }),
    validator("param", communityIdParamSchema),
    async (context) => {
      const { communityId } = context.req.valid("param");

      await context.get("services").community.remove({ communityId });

      return context.body(null, 204);
    },
  );

import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import type { AppContext } from "@server/app";
import { adminMiddleware } from "../middlewares/auth";
import {
  campaignIdParamSchema,
  campaignLeadQuerySchema,
  campaignQuerySchema,
  createCampaignSchema,
  updateCampaignSchema,
} from "../validations/campaign";

export const campaignController = new Hono<AppContext>()
  .use(adminMiddleware)

  .get(
    "/",
    describeRoute({ tags: ["campaign"] }),
    validator("query", campaignQuerySchema),
    async (context) => {
      const query = context.req.valid("query");

      const result = await context.get("services").campaign.list({
        page: query?.page,
        search: query?.search,
        status: query?.status,
      });

      return context.json(result);
    },
  )

  .get(
    "/:campaignId",
    describeRoute({ tags: ["campaign"] }),
    validator("param", campaignIdParamSchema),
    async (context) => {
      const { campaignId } = context.req.valid("param");

      const result = await context
        .get("services")
        .campaign.show({ campaignId });

      return context.json(result);
    },
  )

  .get(
    "/:campaignId/leads",
    describeRoute({ tags: ["campaign"] }),
    validator("param", campaignIdParamSchema),
    validator("query", campaignLeadQuerySchema),
    async (context) => {
      const { campaignId } = context.req.valid("param");
      const query = context.req.valid("query");

      const result = await context.get("services").campaign.listLeads(
        { campaignId },
        {
          page: query?.page,
          search: query?.search,
          stage: query?.stage,
          status: query?.status,
        },
      );

      return context.json(result);
    },
  )

  .post(
    "/",
    describeRoute({ tags: ["campaign"] }),
    validator("json", createCampaignSchema),
    async (context) => {
      const body = context.req.valid("json");

      const campaign = await context.get("services").campaign.create(body);

      return context.json({ campaign }, 201);
    },
  )

  .post(
    "/:campaignId/scrape",
    describeRoute({ tags: ["campaign"] }),
    validator("param", campaignIdParamSchema),
    async (context) => {
      const { campaignId } = context.req.valid("param");

      const result = await context.get("services").scrape.start({ campaignId });

      return context.json(result, 202);
    },
  )

  .patch(
    "/:campaignId",
    describeRoute({ tags: ["campaign"] }),
    validator("param", campaignIdParamSchema),
    validator("json", updateCampaignSchema),
    async (context) => {
      const { campaignId } = context.req.valid("param");
      const body = context.req.valid("json");

      const campaign = await context
        .get("services")
        .campaign.update({ campaignId }, body);

      return context.json({ campaign });
    },
  )

  .delete(
    "/:campaignId",
    describeRoute({ tags: ["campaign"] }),
    validator("param", campaignIdParamSchema),
    async (context) => {
      const { campaignId } = context.req.valid("param");

      await context.get("services").campaign.remove({ campaignId });

      return context.body(null, 204);
    },
  );

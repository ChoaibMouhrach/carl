import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import type { AppContext } from "@server/app";
import { adminMiddleware } from "../middlewares/auth";
import {
  campaignIdParamSchema,
  campaignLeadParamSchema,
  campaignLeadQuerySchema,
  previewFilterSchema,
  promptFilterSchema,
  saveFilterSchema,
  campaignQuerySchema,
  createCampaignSchema,
  scrapeQuerySchema,
  updateCampaignSchema,
} from "../validations/campaign";

import { csvHeaders } from "../csv";

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
    "/export",
    describeRoute({ tags: ["campaign"] }),
    validator("query", campaignQuerySchema),
    async (context) => {
      const query = context.req.valid("query");

      const { csv, filename } = await context
        .get("services")
        .campaign.exportCsv({ search: query?.search, status: query?.status });

      return context.body(csv, 200, csvHeaders(filename));
    },
  )

  .get(
    "/:campaignId/leads/export",
    describeRoute({ tags: ["campaign"] }),
    validator("param", campaignIdParamSchema),
    validator("query", campaignLeadQuerySchema),
    async (context) => {
      const { campaignId } = context.req.valid("param");
      const query = context.req.valid("query");

      const { csv, filename } = await context
        .get("services")
        .campaign.exportLeadsCsv(
          { campaignId },
          { search: query?.search, stage: query?.stage, status: query?.status },
        );

      return context.body(csv, 200, csvHeaders(filename));
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
    validator("query", scrapeQuerySchema),
    async (context) => {
      const { campaignId } = context.req.valid("param");
      const query = context.req.valid("query");

      const result = await context.get("services").scrape.start({
        campaignId,
        replace: query?.replace === "true",
      });

      return context.json(result, 202);
    },
  )

  .get(
    "/:campaignId/filter",
    describeRoute({ tags: ["campaign"] }),
    validator("param", campaignIdParamSchema),
    async (context) => {
      const { campaignId } = context.req.valid("param");

      const result = await context.get("services").filter.show({ campaignId });

      return context.json(result);
    },
  )

  .put(
    "/:campaignId/filter",
    describeRoute({ tags: ["campaign"] }),
    validator("param", campaignIdParamSchema),
    validator("json", saveFilterSchema),
    async (context) => {
      const { campaignId } = context.req.valid("param");
      const body = context.req.valid("json");

      const result = await context
        .get("services")
        .filter.save({ campaignId }, body);

      return context.json(result);
    },
  )

  .post(
    "/:campaignId/filter/preview",
    describeRoute({ tags: ["campaign"] }),
    validator("param", campaignIdParamSchema),
    validator("json", previewFilterSchema),
    async (context) => {
      const { campaignId } = context.req.valid("param");
      const { leadId } = context.req.valid("json");

      const result = await context
        .get("services")
        .filter.preview({ campaignId, leadId });

      return context.json(result);
    },
  )

  .post(
    "/:campaignId/filter/prompt",
    describeRoute({ tags: ["campaign"] }),
    validator("param", campaignIdParamSchema),
    validator("json", promptFilterSchema),
    async (context) => {
      const { campaignId } = context.req.valid("param");
      const { leadId, ...settings } = context.req.valid("json");

      const result = await context
        .get("services")
        .filter.prompt({ campaignId }, { ...settings, leadId });

      return context.json(result);
    },
  )

  .post(
    "/:campaignId/filter/run",
    describeRoute({ tags: ["campaign"] }),
    validator("param", campaignIdParamSchema),
    async (context) => {
      const { campaignId } = context.req.valid("param");

      const result = await context.get("services").filter.start({ campaignId });

      return context.json(result, 202);
    },
  )

  .post(
    "/:campaignId/filter/reapply",
    describeRoute({ tags: ["campaign"] }),
    validator("param", campaignIdParamSchema),
    async (context) => {
      const { campaignId } = context.req.valid("param");

      const result = await context
        .get("services")
        .filter.reapply({ campaignId });

      return context.json(result);
    },
  )

  .get(
    "/:campaignId/leads/:leadId/assessment",
    describeRoute({ tags: ["campaign"] }),
    validator("param", campaignLeadParamSchema),
    async (context) => {
      const { campaignId, leadId } = context.req.valid("param");

      const result = await context
        .get("services")
        .filter.showAssessment({ campaignId, leadId });

      return context.json(result);
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

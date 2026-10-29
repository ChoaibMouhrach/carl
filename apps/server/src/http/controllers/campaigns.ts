import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { streamSSE } from "hono/streaming";
import type { AppContext } from "@server/app";
import { SSE_HEARTBEAT_MS } from "@server/config/constants";
import { adminMiddleware } from "../middlewares/auth";
import {
  campaignBulkDeleteSchema,
  campaignCommunitiesSchema,
  campaignCreateSchema,
  campaignLeadsSchema,
  campaignListQuerySchema,
  campaignParamSchema,
  campaignUpdateSchema,
} from "../validations/campaigns";

export const campaignController = new Hono<AppContext>()
  .use(adminMiddleware)

  .get(
    "/",
    describeRoute({ tags: ["campaigns"] }),
    validator("query", campaignListQuerySchema),
    async (context) => {
      const query = context.req.valid("query");

      const result = await context.get("services").campaign.list(query);

      return context.json(result);
    },
  )

  .post(
    "/",
    describeRoute({ tags: ["campaigns"] }),
    validator("json", campaignCreateSchema),
    async (context) => {
      const body = context.req.valid("json");

      const campaign = await context.get("services").campaign.create(body);

      return context.json(campaign, 201);
    },
  )

  .post(
    "/bulk-delete",
    describeRoute({ tags: ["campaigns"] }),
    validator("json", campaignBulkDeleteSchema),
    async (context) => {
      const body = context.req.valid("json");

      const result = await context.get("services").campaign.removeMany(body);

      return context.json(result);
    },
  )

  .get(
    "/:campaignId",
    describeRoute({ tags: ["campaigns"] }),
    validator("param", campaignParamSchema),
    async (context) => {
      const { campaignId } = context.req.valid("param");

      const campaign = await context
        .get("services")
        .campaign.get({ campaignId });

      return context.json(campaign);
    },
  )

  .patch(
    "/:campaignId",
    describeRoute({ tags: ["campaigns"] }),
    validator("param", campaignParamSchema),
    validator("json", campaignUpdateSchema),
    async (context) => {
      const { campaignId } = context.req.valid("param");
      const body = context.req.valid("json");

      const campaign = await context
        .get("services")
        .campaign.update({ campaignId }, body);

      return context.json(campaign);
    },
  )

  .delete(
    "/:campaignId",
    describeRoute({ tags: ["campaigns"] }),
    validator("param", campaignParamSchema),
    async (context) => {
      const { campaignId } = context.req.valid("param");

      await context.get("services").campaign.remove({ campaignId });

      return context.body(null, 204);
    },
  )

  .post(
    "/:campaignId/leads",
    describeRoute({ tags: ["campaigns"] }),
    validator("param", campaignParamSchema),
    validator("json", campaignLeadsSchema),
    async (context) => {
      const { campaignId } = context.req.valid("param");
      const { leadIds } = context.req.valid("json");

      const result = await context
        .get("services")
        .campaign.addLeads({ campaignId, leadIds });

      return context.json(result);
    },
  )

  .post(
    "/:campaignId/leads/remove",
    describeRoute({ tags: ["campaigns"] }),
    validator("param", campaignParamSchema),
    validator("json", campaignLeadsSchema),
    async (context) => {
      const { campaignId } = context.req.valid("param");
      const { leadIds } = context.req.valid("json");

      const result = await context
        .get("services")
        .campaign.removeLeads({ campaignId, leadIds });

      return context.json(result);
    },
  )

  .post(
    "/:campaignId/communities",
    describeRoute({ tags: ["campaigns"] }),
    validator("param", campaignParamSchema),
    validator("json", campaignCommunitiesSchema),
    async (context) => {
      const { campaignId } = context.req.valid("param");
      const { communityIds } = context.req.valid("json");

      const result = await context
        .get("services")
        .campaign.addCommunities({ campaignId, communityIds });

      return context.json(result);
    },
  )

  .post(
    "/:campaignId/communities/remove",
    describeRoute({ tags: ["campaigns"] }),
    validator("param", campaignParamSchema),
    validator("json", campaignCommunitiesSchema),
    async (context) => {
      const { campaignId } = context.req.valid("param");
      const { communityIds } = context.req.valid("json");

      const result = await context
        .get("services")
        .campaign.removeCommunities({ campaignId, communityIds });

      return context.json(result);
    },
  )

  .get(
    "/:campaignId/pipeline",
    describeRoute({ tags: ["campaigns"] }),
    validator("param", campaignParamSchema),
    async (context) => {
      const { campaignId } = context.req.valid("param");

      const pipeline = await context
        .get("services")
        .pipeline.get({ campaignId });

      return context.json(pipeline);
    },
  )

  .get(
    "/:campaignId/pipeline/events",
    describeRoute({ tags: ["campaigns"] }),
    validator("param", campaignParamSchema),
    async (context) => {
      const { campaignId } = context.req.valid("param");
      const abort = new AbortController();

      const states = await context
        .get("services")
        .pipeline.watch({ campaignId }, abort.signal);

      return streamSSE(context, async (stream) => {
        stream.onAbort(() => abort.abort());

        const heartbeat = setInterval(() => {
          void stream.writeSSE({ event: "heartbeat", data: "" });
        }, SSE_HEARTBEAT_MS);

        try {
          for await (const state of states) {
            await stream.writeSSE({ data: JSON.stringify(state) });
          }
        } finally {
          clearInterval(heartbeat);
        }
      });
    },
  )

  .post(
    "/:campaignId/pipeline/scrape",
    describeRoute({ tags: ["campaigns"] }),
    validator("param", campaignParamSchema),
    async (context) => {
      const { campaignId } = context.req.valid("param");

      const run = await context
        .get("services")
        .pipeline.startScrape({ campaignId });

      return context.json(run, 202);
    },
  )

  .post(
    "/:campaignId/pipeline/enrich",
    describeRoute({ tags: ["campaigns"] }),
    validator("param", campaignParamSchema),
    async (context) => {
      const { campaignId } = context.req.valid("param");

      const run = await context
        .get("services")
        .pipeline.startEnrich({ campaignId });

      return context.json(run, 202);
    },
  );

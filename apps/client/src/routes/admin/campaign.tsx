import { AdminCampaignPage } from "@/pages/admin/campaign/page";
import { createRoute } from "@tanstack/react-router";
import { perPageSearchSchema } from "@/lib/page-size";
import z from "zod";
import { pipelineStepSchema } from "@/pages/admin/campaign/pipeline/pipeline-step";
import { adminLayoutRoute } from "./layout";

const paramsSchema = z.object({
  campaignId: z.coerce.number().int().positive(),
});

export const adminCampaignRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/campaigns/$campaignId",
  component: AdminCampaignPage,
  params: {
    parse: (params) => paramsSchema.parse(params),
    stringify: ({ campaignId }) => ({ campaignId: String(campaignId) }),
  },
  validateSearch: z.object({
    step: pipelineStepSchema.catch("scrape"),
    page: z.coerce.number().int().min(1).catch(1),
    perPage: perPageSearchSchema,
    search: z.string().trim().min(1).optional().catch(undefined),
    hasEmail: z.boolean().optional().catch(undefined),
    sort: z.enum(["name", "username", "createdAt"]).optional().catch(undefined),
    order: z.enum(["asc", "desc"]).optional().catch(undefined),
  }),
});

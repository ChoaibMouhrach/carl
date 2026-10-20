import { AdminCampaignFilterPage } from "@/pages/admin/campaign-filter/page";
import { createRoute } from "@tanstack/react-router";
import z from "zod";
import { adminLayoutRoute } from "./layout";

const paramsSchema = z.object({
  campaignId: z.coerce.number().int().positive(),
});

export const adminCampaignFilterRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/campaigns/$campaignId/filter",
  component: AdminCampaignFilterPage,
  params: {
    parse: (params) => paramsSchema.parse(params),
    stringify: ({ campaignId }) => ({ campaignId: String(campaignId) }),
  },
});

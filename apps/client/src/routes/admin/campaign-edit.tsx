import { AdminCampaignEditPage } from "@/pages/admin/campaign-edit/page";
import { createRoute } from "@tanstack/react-router";
import z from "zod";
import { adminLayoutRoute } from "./layout";

const paramsSchema = z.object({
  campaignId: z.coerce.number().int().positive(),
});

export const adminCampaignEditRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/campaigns/$campaignId/edit",
  component: AdminCampaignEditPage,
  params: {
    parse: (params) => paramsSchema.parse(params),
    stringify: ({ campaignId }) => ({ campaignId: String(campaignId) }),
  },
});

import { AdminCampaignsPage } from "@/pages/admin/campaigns/page";
import { campaignStatuses } from "@/lib/campaign";
import { createRoute } from "@tanstack/react-router";
import z from "zod";
import { adminLayoutRoute } from "./layout";

export const adminCampaignsRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/campaigns",
  component: AdminCampaignsPage,
  validateSearch: z.object({
    page: z.coerce.number().int().min(1).catch(1),
    search: z.string().trim().min(1).optional().catch(undefined),
    status: z.enum(campaignStatuses).optional().catch(undefined),
  }),
});

import { AdminCampaignPage } from "@/pages/admin/campaign/page";
import { createRoute } from "@tanstack/react-router";
import { perPageSearchSchema } from "@/lib/page-size";
import z from "zod";
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
    tab: z.enum(["leads", "communities"]).catch("leads"),
    page: z.coerce.number().int().min(1).catch(1),
    perPage: perPageSearchSchema,
  }),
});

import { AdminCampaignPage } from "@/pages/admin/campaign/page";
import { leadStatuses, stageNumbers } from "@/lib/campaign";
import { createRoute } from "@tanstack/react-router";
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
    page: z.coerce.number().int().min(1).catch(1),
    search: z.string().trim().min(1).optional().catch(undefined),
    stage: z.coerce
      .number()
      .pipe(z.literal(stageNumbers))
      .optional()
      .catch(undefined),
    status: z.enum(leadStatuses).optional().catch(undefined),
  }),
});

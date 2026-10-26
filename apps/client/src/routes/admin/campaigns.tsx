import { AdminCampaignsPage } from "@/pages/admin/campaigns/page";
import { createRoute } from "@tanstack/react-router";
import { perPageSearchSchema } from "@/lib/page-size";
import z from "zod";
import { adminLayoutRoute } from "./layout";

export const adminCampaignsRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/campaigns",
  component: AdminCampaignsPage,
  validateSearch: z.object({
    page: z.coerce.number().int().min(1).catch(1),
    perPage: perPageSearchSchema,
    search: z.string().trim().min(1).optional().catch(undefined),
    sort: z.enum(["name", "createdAt"]).optional().catch(undefined),
    order: z.enum(["asc", "desc"]).optional().catch(undefined),
  }),
});

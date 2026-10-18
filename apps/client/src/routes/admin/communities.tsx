import { AdminCommunitiesPage } from "@/pages/admin/communities/page";
import { createRoute } from "@tanstack/react-router";
import z from "zod";
import { adminLayoutRoute } from "./layout";

export const adminCommunitiesRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/communities",
  component: AdminCommunitiesPage,
  validateSearch: z.object({
    page: z.coerce.number().int().min(1).catch(1),
    search: z.string().trim().min(1).optional().catch(undefined),
    pricingType: z.enum(["free", "paid"]).optional().catch(undefined),
    minMembers: z.coerce.number().int().min(0).optional().catch(undefined),
    minRevenue: z.coerce.number().min(0).optional().catch(undefined),
    sortBy: z
      .enum(["estMonthlyRevenue", "memberCount", "createdAt", "name"])
      .optional()
      .catch(undefined),
    sortOrder: z.enum(["asc", "desc"]).optional().catch(undefined),
  }),
});

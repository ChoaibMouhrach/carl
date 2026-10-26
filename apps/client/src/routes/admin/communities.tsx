import { AdminCommunitiesPage } from "@/pages/admin/communities/page";
import { createRoute } from "@tanstack/react-router";
import { perPageSearchSchema } from "@/lib/page-size";
import z from "zod";
import { adminLayoutRoute } from "./layout";

const count = z.coerce.number().int().min(0).optional().catch(undefined);

export const adminCommunitiesRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/communities",
  component: AdminCommunitiesPage,
  validateSearch: z.object({
    page: z.coerce.number().int().min(1).catch(1),
    perPage: perPageSearchSchema,
    search: z.string().trim().min(1).optional().catch(undefined),
    leadId: z.coerce.number().int().positive().optional().catch(undefined),
    isFree: z.boolean().optional().catch(undefined),
    hasEmail: z.boolean().optional().catch(undefined),
    minMembers: count,
    maxMembers: count,
    minMrr: count,
    maxMrr: count,
    sort: z
      .enum(["name", "members", "mrr", "priceCents", "createdAt"])
      .optional()
      .catch(undefined),
    order: z.enum(["asc", "desc"]).optional().catch(undefined),
  }),
});

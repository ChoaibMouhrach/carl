import { AdminLeadsPage } from "@/pages/admin/leads/page";
import { createRoute } from "@tanstack/react-router";
import z from "zod";
import { adminLayoutRoute } from "./layout";

export const adminLeadsRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/leads",
  component: AdminLeadsPage,
  validateSearch: z.object({
    page: z.coerce.number().int().min(1).catch(1),
    search: z.string().trim().min(1).optional().catch(undefined),
    hasWebsite: z.boolean().optional().catch(undefined),
    sortBy: z
      .enum(["createdAt", "name", "communityCount"])
      .optional()
      .catch(undefined),
    sortOrder: z.enum(["asc", "desc"]).optional().catch(undefined),
  }),
});

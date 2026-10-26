import { AdminLeadsPage } from "@/pages/admin/leads/page";
import { createRoute } from "@tanstack/react-router";
import { perPageSearchSchema } from "@/lib/page-size";
import z from "zod";
import { adminLayoutRoute } from "./layout";

export const adminLeadsRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/leads",
  component: AdminLeadsPage,
  validateSearch: z.object({
    page: z.coerce.number().int().min(1).catch(1),
    perPage: perPageSearchSchema,
    search: z.string().trim().min(1).optional().catch(undefined),
    hasEmail: z.boolean().optional().catch(undefined),
    campaignId: z.coerce.number().int().positive().optional().catch(undefined),
    sort: z.enum(["name", "username", "createdAt"]).optional().catch(undefined),
    order: z.enum(["asc", "desc"]).optional().catch(undefined),
  }),
});

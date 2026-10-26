import { AdminCommunityCreatePage } from "@/pages/admin/community-create/page";
import { createRoute } from "@tanstack/react-router";
import z from "zod";
import { adminLayoutRoute } from "./layout";

export const adminCommunityCreateRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/communities/new",
  component: AdminCommunityCreatePage,
  validateSearch: z.object({
    leadId: z.coerce.number().int().positive().optional().catch(undefined),
  }),
});

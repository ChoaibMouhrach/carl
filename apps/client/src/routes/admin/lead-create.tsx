import { AdminLeadCreatePage } from "@/pages/admin/lead-create/page";
import { createRoute } from "@tanstack/react-router";
import { adminLayoutRoute } from "./layout";

export const adminLeadCreateRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/leads/new",
  component: AdminLeadCreatePage,
});

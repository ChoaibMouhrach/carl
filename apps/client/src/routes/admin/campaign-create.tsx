import { AdminCampaignCreatePage } from "@/pages/admin/campaign-create/page";
import { createRoute } from "@tanstack/react-router";
import { adminLayoutRoute } from "./layout";

export const adminCampaignCreateRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/campaigns/new",
  component: AdminCampaignCreatePage,
});

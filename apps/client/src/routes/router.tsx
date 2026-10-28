import { rootRoute } from "./root";
import { authRouteTree } from "./auth";
import { errorRoute } from "./error";
import { setupRoute } from "./setup";
import { indexRoute } from "./index";
import { adminAccountRoute } from "./admin/account";
import { adminDashboardRoute } from "./admin/dashboard";
import { adminLayoutRoute } from "./admin/layout";
import { adminQueuesRoute } from "./admin/queues";
import { adminLeadsRoute } from "./admin/leads";
import { adminLeadRoute } from "./admin/lead";
import { adminLeadCreateRoute } from "./admin/lead-create";
import { adminLeadEditRoute } from "./admin/lead-edit";
import { adminCommunitiesRoute } from "./admin/communities";
import { adminCommunityRoute } from "./admin/community";
import { adminCommunityCreateRoute } from "./admin/community-create";
import { adminCommunityEditRoute } from "./admin/community-edit";
import { adminCampaignsRoute } from "./admin/campaigns";
import { adminCampaignCreateRoute } from "./admin/campaign-create";
import { adminCampaignRoute } from "./admin/campaign";
import { adminCampaignEditRoute } from "./admin/campaign-edit";

export const routeTree = rootRoute.addChildren([
  indexRoute,
  adminLayoutRoute.addChildren([
    adminDashboardRoute,
    adminAccountRoute,
    adminQueuesRoute,
    adminLeadsRoute,
    adminLeadCreateRoute,
    adminLeadRoute,
    adminLeadEditRoute,
    adminCommunitiesRoute,
    adminCommunityCreateRoute,
    adminCommunityRoute,
    adminCommunityEditRoute,
    adminCampaignsRoute,
    adminCampaignCreateRoute,
    adminCampaignRoute,
    adminCampaignEditRoute,
  ]),
  authRouteTree,
  errorRoute,
  setupRoute,
]);

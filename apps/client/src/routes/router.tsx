import { rootRoute } from "./root";
import { authRouteTree } from "./auth";
import { errorRoute } from "./error";
import { setupRoute } from "./setup";
import { dashboardRoute } from "./dashboard";
import { indexRoute } from "./index";
import { adminAccountRoute } from "./admin/account";
import { adminDashboardRoute } from "./admin/dashboard";
import { adminLayoutRoute } from "./admin/layout";
import { adminUsersRoute } from "./admin/users";
import { userAccountRoute } from "./user/account";
import { userDashboardRoute } from "./user/dashboard";
import { userLayoutRoute } from "./user/layout";
import { userBillingRoute } from "./user/billing";
import { userSelectPlanRoute } from "./user/select-plan";

export const routeTree = rootRoute.addChildren([
  indexRoute,
  dashboardRoute,
  adminLayoutRoute.addChildren([
    adminDashboardRoute,
    adminAccountRoute,
    adminUsersRoute,
  ]),
  userLayoutRoute.addChildren([
    userDashboardRoute,
    userAccountRoute,
    userBillingRoute,
  ]),
  userSelectPlanRoute,
  authRouteTree,
  errorRoute,
  setupRoute,
]);

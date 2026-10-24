import { rootRoute } from "./root";
import { authRouteTree } from "./auth";
import { errorRoute } from "./error";
import { setupRoute } from "./setup";
import { indexRoute } from "./index";
import { adminAccountRoute } from "./admin/account";
import { adminDashboardRoute } from "./admin/dashboard";
import { adminLayoutRoute } from "./admin/layout";
import { adminQueuesRoute } from "./admin/queues";

export const routeTree = rootRoute.addChildren([
  indexRoute,
  adminLayoutRoute.addChildren([
    adminDashboardRoute,
    adminAccountRoute,
    adminQueuesRoute,
  ]),
  authRouteTree,
  errorRoute,
  setupRoute,
]);

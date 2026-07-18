import { UserDashboardPage } from "@/pages/user/dashboard/page";
import { createRoute } from "@tanstack/react-router";
import { userLayoutRoute } from "./layout";

export const userDashboardRoute = createRoute({
  getParentRoute: () => userLayoutRoute,
  path: "/user/dashboard",
  component: UserDashboardPage,
});

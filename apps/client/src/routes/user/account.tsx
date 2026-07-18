import { UserAccountPage } from "@/pages/user/account/page";
import { createRoute } from "@tanstack/react-router";
import { userLayoutRoute } from "./layout";

export const userAccountRoute = createRoute({
  getParentRoute: () => userLayoutRoute,
  path: "/user/account",
  component: UserAccountPage,
});

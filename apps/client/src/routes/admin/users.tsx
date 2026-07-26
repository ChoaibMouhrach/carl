import { AdminUsersPage } from "@/pages/admin/users/page";
import { createRoute } from "@tanstack/react-router";
import { adminLayoutRoute } from "./layout";

export const adminUsersRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/users",
  component: AdminUsersPage,
});

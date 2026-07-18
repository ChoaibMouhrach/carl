import { AdminDashboardPage } from "@/pages/admin/dashboard/page";
import { createRoute } from "@tanstack/react-router";
import { adminLayoutRoute } from "./layout";

export const adminDashboardRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/dashboard",
  component: AdminDashboardPage,
});

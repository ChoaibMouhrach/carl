import { AdminUsersPage } from "@/pages/admin/users/page";
import { createRoute } from "@tanstack/react-router";
import z from "zod";
import { adminLayoutRoute } from "./layout";

export const adminUsersRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/users",
  component: AdminUsersPage,
  validateSearch: z.object({
    page: z.coerce.number().int().min(1).catch(1),
    role: z.enum(["admin", "user"]).optional(),
    search: z.string().trim().min(1).optional(),
    verification: z.enum(["verified", "unverified"]).optional(),
  }),
});

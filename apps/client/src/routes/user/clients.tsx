import { UserClientsPage } from "@/pages/user/clients/page";
import { createRoute } from "@tanstack/react-router";
import z from "zod";
import { userLayoutRoute } from "./layout";

export const userClientsRoute = createRoute({
  getParentRoute: () => userLayoutRoute,
  path: "/user/clients",
  component: UserClientsPage,
  validateSearch: z.object({
    page: z.coerce.number().int().min(1).catch(1),
    search: z.string().trim().min(1).optional(),
  }),
});

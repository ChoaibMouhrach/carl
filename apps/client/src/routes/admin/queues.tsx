import { AdminQueuesPage } from "@/pages/admin/queues/page";
import { createRoute } from "@tanstack/react-router";
import z from "zod";
import { adminLayoutRoute } from "./layout";

export const adminQueuesRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/queues",
  component: AdminQueuesPage,
  validateSearch: z.object({
    page: z.coerce.number().int().min(1).catch(1),
    queue: z.string().trim().min(1).optional(),
  }),
});

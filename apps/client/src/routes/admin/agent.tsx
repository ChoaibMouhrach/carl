import { AdminAgentPage } from "@/pages/admin/agent/page";
import { createRoute } from "@tanstack/react-router";
import z from "zod";
import { adminLayoutRoute } from "./layout";

export const adminAgentRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/agents/$clientId",
  component: AdminAgentPage,
  validateSearch: z.object({
    page: z.coerce.number().int().min(1).catch(1),
    request: z.coerce.number().int().positive().optional().catch(undefined),
  }),
});

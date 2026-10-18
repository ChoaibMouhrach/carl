import { AdminLeadPage } from "@/pages/admin/lead/page";
import { createRoute } from "@tanstack/react-router";
import z from "zod";
import { adminLayoutRoute } from "./layout";

const paramsSchema = z.object({
  leadId: z.coerce.number().int().positive(),
});

export const adminLeadRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/leads/$leadId",
  component: AdminLeadPage,
  params: {
    parse: (params) => paramsSchema.parse(params),
    stringify: ({ leadId }) => ({ leadId: String(leadId) }),
  },
});

import { AdminLeadEditPage } from "@/pages/admin/lead-edit/page";
import { createRoute } from "@tanstack/react-router";
import z from "zod";
import { adminLayoutRoute } from "./layout";

const paramsSchema = z.object({
  leadId: z.coerce.number().int().positive(),
});

export const adminLeadEditRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/leads/$leadId/edit",
  component: AdminLeadEditPage,
  params: {
    parse: (params) => paramsSchema.parse(params),
    stringify: ({ leadId }) => ({ leadId: String(leadId) }),
  },
});

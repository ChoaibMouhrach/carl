import { AdminCommunityEditPage } from "@/pages/admin/community-edit/page";
import { createRoute } from "@tanstack/react-router";
import z from "zod";
import { adminLayoutRoute } from "./layout";

const paramsSchema = z.object({
  communityId: z.coerce.number().int().positive(),
});

export const adminCommunityEditRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/communities/$communityId/edit",
  component: AdminCommunityEditPage,
  params: {
    parse: (params) => paramsSchema.parse(params),
    stringify: ({ communityId }) => ({ communityId: String(communityId) }),
  },
});

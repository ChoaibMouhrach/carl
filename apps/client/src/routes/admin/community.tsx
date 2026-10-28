import { AdminCommunityPage } from "@/pages/admin/community/page";
import { createRoute } from "@tanstack/react-router";
import z from "zod";
import { adminLayoutRoute } from "./layout";

const paramsSchema = z.object({
  communityId: z.coerce.number().int().positive(),
});

export const adminCommunityRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/communities/$communityId",
  component: AdminCommunityPage,
  params: {
    parse: (params) => paramsSchema.parse(params),
    stringify: ({ communityId }) => ({ communityId: String(communityId) }),
  },
});

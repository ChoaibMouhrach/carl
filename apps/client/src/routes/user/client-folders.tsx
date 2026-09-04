import { UserClientFoldersPage } from "@/pages/user/client-folders/page";
import { createRoute } from "@tanstack/react-router";
import z from "zod";
import { userLayoutRoute } from "./layout";

export const userClientFoldersRoute = createRoute({
  getParentRoute: () => userLayoutRoute,
  path: "/user/clients/$clientId/folders",
  component: UserClientFoldersPage,
  validateSearch: z.object({
    page: z.coerce.number().int().min(1).catch(1),
    search: z.string().trim().min(1).optional(),
    parentId: z.coerce.number().int().positive().optional(),
  }),
});

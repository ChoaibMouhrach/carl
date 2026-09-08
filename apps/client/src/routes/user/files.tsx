import { UserFilesPage } from "@/pages/user/files/page";
import { createRoute } from "@tanstack/react-router";
import z from "zod";
import { userLayoutRoute } from "./layout";

export const userFilesRoute = createRoute({
  getParentRoute: () => userLayoutRoute,
  path: "/user/files",
  component: UserFilesPage,
  validateSearch: z.object({
    page: z.coerce.number().int().min(1).catch(1),
    search: z.string().trim().min(1).optional(),
  }),
});

import { UserLayout } from "@/pages/user/layout";
import { createRoute } from "@tanstack/react-router";
import { requireAuth, requireOnboarded } from "../middlewares";
import { rootRoute } from "../root";

export const userLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "user-layout",
  beforeLoad: async () => {
    const me = await requireAuth("user");
    requireOnboarded(me);
    return me;
  },
  component: UserLayout,
});

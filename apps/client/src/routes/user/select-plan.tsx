import { SelectPlanPage } from "@/pages/user/select-plan/page";
import { createRoute } from "@tanstack/react-router";
import { requireAuth, requireNotOnboarded } from "../middlewares";
import { rootRoute } from "../root";

export const userSelectPlanRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/user/select-plan",
  beforeLoad: async () => {
    const me = await requireAuth("user");
    requireNotOnboarded(me);
    return me;
  },
  component: SelectPlanPage,
});

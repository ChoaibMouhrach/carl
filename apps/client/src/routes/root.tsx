import { api } from "@/api";
import { RouteLoadingBar } from "@/components/route-loading-bar";
import { TooltipProvider } from "@repo/ui/components/ui/tooltip";
import { RouteErrorScreen, RouteNotFound } from "@/pages/error/page";
import { Outlet, createRootRoute, redirect } from "@tanstack/react-router";

export const rootRoute = createRootRoute({
  component: () => (
    <TooltipProvider>
      <RouteLoadingBar />
      <Outlet />
    </TooltipProvider>
  ),
  errorComponent: RouteErrorScreen,
  notFoundComponent: RouteNotFound,
  beforeLoad: async ({ location }) => {
    const { setupDone } = await api.platformSetup.check();
    const isSetupRoute = location.pathname === "/setup";

    if (setupDone) {
      if (isSetupRoute) {
        throw redirect({ to: "/sign-in" });
      }
      return;
    }

    if (isSetupRoute) {
      return;
    }

    throw redirect({
      to: "/setup",
    });
  },
});

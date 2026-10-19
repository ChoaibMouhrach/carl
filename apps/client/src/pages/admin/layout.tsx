import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@repo/ui/components/ui/sidebar";
import { getRouteApi, Outlet } from "@tanstack/react-router";
import { ModeToggle } from "@/components/mode-toggle";
import { useLiveEvents } from "@/lib/live-events";
import { readSidebarOpen } from "@/lib/sidebar-state";
import { AdminSidebar } from "./sidebar";

const route = getRouteApi("/admin-layout");

export const AdminLayout = () => {
  const { user } = route.useRouteContext();

  useLiveEvents();

  return (
    <SidebarProvider defaultOpen={readSidebarOpen()}>
      <AdminSidebar user={user} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-3 px-4 sm:px-6">
          <SidebarTrigger />
          <div className="ml-auto flex items-center gap-2">
            <ModeToggle />
          </div>
        </header>
        <div className="flex flex-1 flex-col">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

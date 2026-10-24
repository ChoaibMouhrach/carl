import { ProfileDropdown } from "@/components/profile-dropdown";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@repo/ui/components/ui/sidebar";
import { Link, useLocation } from "@tanstack/react-router";
import { Logo, LogoWithText } from "@repo/ui/logo-mark";
import { LayersIcon, LayoutDashboardIcon, type LucideIcon } from "lucide-react";

interface AdminSidebarProps {
  user: {
    userId: string;
    email: string;
    role: string;
  };
}

interface NavigationItem {
  label: string;
  to: "/admin/dashboard" | "/admin/queues";
  icon: LucideIcon;
}

const navigation: NavigationItem[] = [
  {
    label: "Dashboard",
    to: "/admin/dashboard",
    icon: LayoutDashboardIcon,
  },
  {
    label: "Queues",
    to: "/admin/queues",
    icon: LayersIcon,
  },
];

export const AdminSidebar: React.FC<AdminSidebarProps> = ({ user }) => {
  const location = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();

  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip="Carl"
              className="[&>svg]:size-8! [&>svg:first-child]:h-8! [&>svg:first-child]:w-auto!"
              render={<Link to="/admin/dashboard" />}
            >
              <LogoWithText
                size={64}
                className="group-data-[collapsible=icon]:hidden"
              />
              <Logo
                size={28}
                className="hidden group-data-[collapsible=icon]:block"
              />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    isActive={
                      location.pathname === item.to ||
                      location.pathname.startsWith(`${item.to}/`)
                    }
                    tooltip={item.label}
                    render={<Link to={item.to} onClick={closeOnMobile} />}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <ProfileDropdown
          user={user}
          onNavigate={closeOnMobile}
          className="w-full justify-start overflow-hidden group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:justify-center! group-data-[collapsible=icon]:p-0!"
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};

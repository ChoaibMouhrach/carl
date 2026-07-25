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
import { useTranslation } from "react-i18next";
import { Logo, LogoWithText } from "@repo/ui/logo-mark";
import { LayoutDashboardIcon, type LucideIcon } from "lucide-react";

interface AdminSidebarProps {
  user: {
    userId: number;
    email: string;
    role: string;
  };
}

interface NavigationItem {
  labelKey: "nav.dashboard";
  to: "/admin/dashboard";
  icon: LucideIcon;
}

const navigation: NavigationItem[] = [
  {
    labelKey: "nav.dashboard",
    to: "/admin/dashboard",
    icon: LayoutDashboardIcon,
  },
];

export const AdminSidebar: React.FC<AdminSidebarProps> = ({ user }) => {
  const location = useLocation();
  const { t } = useTranslation();
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
              asChild
              size="lg"
              tooltip="Rizon"
              className="[&>svg]:size-8! [&>svg:first-child]:h-8! [&>svg:first-child]:w-auto!"
            >
              <Link to="/admin/dashboard">
                <LogoWithText
                  size={64}
                  className="group-data-[collapsible=icon]:hidden"
                />
                <Logo
                  size={28}
                  className="hidden group-data-[collapsible=icon]:block"
                />
              </Link>
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
                    asChild
                    isActive={location.pathname === item.to}
                    tooltip={t(item.labelKey)}
                  >
                    <Link to={item.to} onClick={closeOnMobile}>
                      <item.icon />
                      <span>{t(item.labelKey)}</span>
                    </Link>
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
          accountPath="/admin/account"
          onNavigate={closeOnMobile}
          className="w-full justify-start overflow-hidden group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:justify-center! group-data-[collapsible=icon]:p-0!"
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};

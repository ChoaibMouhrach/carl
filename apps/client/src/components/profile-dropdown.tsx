import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { Button } from "@repo/ui/components/ui/button";
import { ChevronsUpDown } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@tanstack/react-router";
import { onError } from "@/lib/base-api";
import { authClient, unwrapAuthResponse } from "@/lib/auth-client";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { cn } from "@repo/ui/utils";

interface ProfileDropdownProps {
  user: {
    userId: string;
    email: string;
    role: string;
  };
  accountPath: "/admin/account" | "/user/account";
  onNavigate?: () => void;
  className?: string;
}

export const ProfileDropdown: React.FC<ProfileDropdownProps> = ({
  user,
  accountPath,
  onNavigate,
  className,
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const roleLabel =
    user.role === "admin"
      ? t("roles.admin")
      : user.role === "user"
        ? t("roles.user")
        : user.role.charAt(0).toUpperCase() + user.role.slice(1);

  const signOut = useMutation({
    mutationFn: () => {
      return unwrapAuthResponse(authClient.signOut());
    },
    onSuccess: () => {
      navigate({ to: "/sign-in" });
    },
    onError,
  });

  const onSignOut = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    e.preventDefault();
    signOut.mutate();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn("h-auto py-2 bg-muted/50", className)}
        >
          <span className="hidden font-normal text-lg leading-none group-data-[collapsible=icon]:inline">
            {user.email.charAt(0).toUpperCase()}
          </span>
          <div className="flex min-w-0 flex-col items-start group-data-[collapsible=icon]:hidden">
            <span>{roleLabel}</span>
            <span className="text-muted-foreground max-w-full truncate">
              {user.email}
            </span>
          </div>
          <ChevronsUpDown
            className="text-muted-foreground ml-auto shrink-0 group-data-[collapsible=icon]:hidden"
            size={16}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("profile.myAccount")}</DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link to={accountPath} onClick={() => onNavigate?.()}>
              {t("profile.settings")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={signOut.isPending} onClick={onSignOut}>
            {t("profile.signOut")} {signOut.isPending && <Spinner />}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

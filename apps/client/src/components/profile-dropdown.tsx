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
import { Link, useNavigate } from "@tanstack/react-router";
import { onError } from "@/lib/base-api";
import { api } from "@/api";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { cn } from "@repo/ui/utils";

interface ProfileDropdownProps {
  user: {
    userId: number;
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

  const signOut = useMutation({
    mutationFn: () => {
      return api.auth.signOut();
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
            <span>
              {user.role.charAt(0)?.toUpperCase() + user.role.slice(1)}
            </span>
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
          <DropdownMenuLabel>My Account</DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link to={accountPath} onClick={() => onNavigate?.()}>
              Account
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={signOut.isPending} onClick={onSignOut}>
            Sign out {signOut.isPending && <Spinner />}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

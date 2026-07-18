import { api } from "@/api";
import { onError } from "@/lib/base-api";
import { Button } from "@repo/ui/components/ui/button";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { Logo } from "@repo/ui/logo-mark";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";

interface HeaderProps {
  email: string;
}

export const Header: React.FC<HeaderProps> = ({ email }) => {
  const navigate = useNavigate();
  const signOut = useMutation({
    mutationFn: () => api.auth.signOut(),
    onError,
    onSuccess: () => navigate({ to: "/sign-in" }),
  });

  return (
    <header className="border-border/40 flex h-16 items-center justify-between border-b px-6">
      <Logo size={32} />
      <div className="flex items-center gap-4">
        <span className="text-muted-foreground text-sm">{email}</span>
        <ModeToggle />
        <Button
          disabled={signOut.isPending}
          onClick={() => signOut.mutate()}
          size="sm"
          variant="outline"
        >
          {signOut.isPending ? <Spinner /> : <LogOut />}
          Sign out
        </Button>
      </div>
    </header>
  );
};

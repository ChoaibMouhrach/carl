import { Avatar, AvatarFallback } from "@repo/ui/components/ui/avatar";
import { CardDescription, CardTitle } from "@repo/ui/components/ui/card";

interface CardIdentityProps {
  description?: React.ReactNode;
  avatar: React.ReactNode;
  leading?: React.ReactNode;
  title: React.ReactNode;
}

export const CardIdentity = ({
  description,
  avatar,
  leading,
  title,
}: CardIdentityProps) => (
  <div className="flex min-w-0 items-center gap-3">
    {leading}
    <Avatar size="lg">
      <AvatarFallback>{avatar}</AvatarFallback>
    </Avatar>
    <div className="min-w-0">
      <CardTitle className="truncate">{title}</CardTitle>
      {description && (
        <CardDescription className="truncate">{description}</CardDescription>
      )}
    </div>
  </div>
);

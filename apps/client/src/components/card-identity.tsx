import { PictureAvatar } from "@/components/picture-avatar";
import { CardDescription, CardTitle } from "@repo/ui/components/ui/card";

interface CardIdentityProps {
  description?: React.ReactNode;
  /** Shown instead of initials once it loads */
  image?: string | null;
  leading?: React.ReactNode;
  /** The name the initials are taken from */
  name: string;
  title: React.ReactNode;
}

export const CardIdentity = ({
  description,
  image,
  leading,
  name,
  title,
}: CardIdentityProps) => (
  <div className="flex min-w-0 items-center gap-3">
    {leading}
    <PictureAvatar name={name} size="lg" src={image} />
    <div className="min-w-0">
      <CardTitle className="truncate">{title}</CardTitle>
      {description && (
        <CardDescription className="truncate">{description}</CardDescription>
      )}
    </div>
  </div>
);

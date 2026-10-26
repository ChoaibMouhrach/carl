import { initialsOf } from "@/lib/initials";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@repo/ui/components/ui/avatar";

interface PictureAvatarProps {
  className?: string;
  /** Used for the initials shown while the picture loads or when there is none */
  name: string;
  size?: "default" | "sm" | "lg";
  src?: string | null;
}

export const PictureAvatar = ({
  className,
  name,
  size,
  src,
}: PictureAvatarProps) => (
  <Avatar className={className} size={size}>
    {src && (
      <AvatarImage
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        src={src}
      />
    )}
    <AvatarFallback>{initialsOf(name)}</AvatarFallback>
  </Avatar>
);

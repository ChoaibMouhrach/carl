import { AspectRatio } from "@repo/ui/components/ui/aspect-ratio";

interface CoverImageProps {
  src: string;
}

// Decorative: the name is always shown next to it
export const CoverImage = ({ src }: CoverImageProps) => (
  <AspectRatio className="overflow-hidden rounded-lg bg-muted" ratio={16 / 9}>
    <img
      alt=""
      className="size-full object-cover"
      loading="lazy"
      referrerPolicy="no-referrer"
      src={src}
    />
  </AspectRatio>
);

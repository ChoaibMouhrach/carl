import { Skeleton } from "@repo/ui/components/ui/skeleton";

export const CardGrid = ({ children }: { children: React.ReactNode }) => (
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
);

interface CardGridSkeletonProps {
  count?: number;
}

export const CardGridSkeleton = ({ count = 6 }: CardGridSkeletonProps) => (
  <CardGrid>
    {Array.from({ length: count }, (_, index) => (
      <Skeleton className="h-40 w-full" key={index} />
    ))}
  </CardGrid>
);

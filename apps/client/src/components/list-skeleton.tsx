import { Skeleton } from "@repo/ui/components/ui/skeleton";

interface ListSkeletonProps {
  rows?: number;
}

export const ListSkeleton = ({ rows = 3 }: ListSkeletonProps) => (
  <div className="space-y-3">
    {Array.from({ length: rows }, (_, row) => (
      <Skeleton className="h-16 w-full" key={row} />
    ))}
  </div>
);

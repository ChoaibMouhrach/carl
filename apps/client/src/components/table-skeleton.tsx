import { Skeleton } from "@repo/ui/components/ui/skeleton";

interface TableSkeletonProps {
  columns: number;
  rows?: number;
}

export const TableSkeleton = ({ columns, rows = 5 }: TableSkeletonProps) => (
  <div className="space-y-4">
    {Array.from({ length: rows }, (_, row) => (
      <div className="flex items-center gap-4" key={row}>
        {Array.from({ length: columns }, (_, column) => (
          <Skeleton className="h-5 flex-1" key={column} />
        ))}
      </div>
    ))}
  </div>
);

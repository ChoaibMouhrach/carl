import { Skeleton } from "@repo/ui/components/ui/skeleton";

export const PlanCardsSkeleton = () => (
  <div className="mt-12 grid gap-4 sm:grid-cols-3">
    {Array.from({ length: 3 }, (_, index) => (
      <div className="space-y-4 rounded-xl border p-6" key={index}>
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-9 w-full" />
      </div>
    ))}
  </div>
);

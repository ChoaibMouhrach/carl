import { api } from "@/api";
import { DataPagination } from "@/components/data-pagination";
import { ListSkeleton } from "@/components/list-skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/ui/components/ui/alert-dialog";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@repo/ui/components/ui/item";
import { Spinner } from "@repo/ui/components/ui/spinner";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  RotateCwIcon,
  Trash2Icon,
} from "lucide-react";

type FailedJob = Awaited<
  ReturnType<typeof api.queue.listFailed>
>["jobs"][number];

interface FailedJobsTableProps {
  currentPage: number;
  isMutating: boolean;
  isPending: boolean;
  isRetryAllPending: boolean;
  jobs: FailedJob[];
  lastPage: number;
  onPageChange: (page: number) => void;
  onRemove: (jobId: string) => void;
  onRetry: (jobId: string) => void;
  onRetryAll: () => void;
  removingJobId?: string;
  retryingJobId?: string;
}

export const FailedJobsTable = ({
  currentPage,
  isMutating,
  isPending,
  isRetryAllPending,
  jobs,
  lastPage,
  onPageChange,
  onRemove,
  onRetry,
  onRetryAll,
  removingJobId,
  retryingJobId,
}: FailedJobsTableProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Failed jobs</CardTitle>
        <CardAction>
          <Button
            disabled={isMutating || jobs.length === 0}
            onClick={onRetryAll}
            size="sm"
            variant="outline"
          >
            {isRetryAllPending ? <Spinner /> : <RotateCwIcon />}
            Retry all
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <ListSkeleton />
        ) : jobs.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CircleCheckIcon />
              </EmptyMedia>
              <EmptyTitle>No failed jobs</EmptyTitle>
              <EmptyDescription>
                Every job in this queue has processed cleanly.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {jobs.map((job) => (
              <Item key={job.id} variant="outline">
                <ItemMedia variant="icon">
                  <CircleAlertIcon />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{job.failedReason || "Unknown error"}</ItemTitle>
                  <ItemDescription>
                    {`${job.attemptsMade} attempts · Job ${job.id}`}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    disabled={isMutating}
                    onClick={() => onRetry(job.id)}
                    size="sm"
                    variant="outline"
                  >
                    {retryingJobId === job.id ? <Spinner /> : <RotateCwIcon />}
                    Retry
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger
                      render={
                        <Button
                          disabled={isMutating}
                          size="sm"
                          variant="ghost"
                        />
                      }
                    >
                      {removingJobId === job.id ? <Spinner /> : <Trash2Icon />}
                      Remove
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove this job?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This permanently removes the job from the queue. This
                          action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => onRemove(job.id)}
                          variant="destructive"
                        >
                          Remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </ItemActions>
              </Item>
            ))}

            <DataPagination
              currentPage={currentPage}
              lastPage={lastPage}
              onPageChange={onPageChange}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

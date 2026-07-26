import { api } from "@/api";
import { DataPagination } from "@/components/data-pagination";
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
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("adminQueues.failedTitle")}</CardTitle>
        <CardAction>
          <Button
            disabled={isMutating || jobs.length === 0}
            onClick={onRetryAll}
            size="sm"
            variant="outline"
          >
            {isRetryAllPending ? <Spinner /> : <RotateCwIcon />}
            {t("adminQueues.retryAll")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Spinner />
        ) : jobs.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CircleCheckIcon />
              </EmptyMedia>
              <EmptyTitle>{t("adminQueues.emptyTitle")}</EmptyTitle>
              <EmptyDescription>
                {t("adminQueues.emptyDescription")}
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
                  <ItemTitle>
                    {job.failedReason || t("adminQueues.unknownError")}
                  </ItemTitle>
                  <ItemDescription>
                    {t("adminQueues.jobMeta", {
                      attempts: job.attemptsMade,
                      id: job.id,
                    })}
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
                    {t("adminQueues.retry")}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button disabled={isMutating} size="sm" variant="ghost">
                        {removingJobId === job.id ? (
                          <Spinner />
                        ) : (
                          <Trash2Icon />
                        )}
                        {t("adminQueues.remove")}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {t("adminQueues.removeTitle")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("adminQueues.removeDescription")}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>
                          {t("adminQueues.cancel")}
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={() => onRemove(job.id)}>
                          {t("adminQueues.remove")}
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

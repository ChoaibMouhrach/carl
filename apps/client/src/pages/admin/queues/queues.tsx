import { api } from "@/api";
import { onError } from "@/lib/base-api";
import { adminQueuesRoute } from "@/routes/admin/queues";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FailedJobsTable } from "./failed-jobs-table";
import { QueueCounts } from "./queue-counts";

export const Queues = () => {
  const { t } = useTranslation();
  const search = adminQueuesRoute.useSearch();
  const navigate = adminQueuesRoute.useNavigate();
  const queryClient = useQueryClient();

  const overview = useQuery({
    queryKey: ["admin", "queues"],
    queryFn: () => api.queue.overview(),
  });

  const selectedQueue =
    search.queue ?? overview.data?.queues.at(0)?.name ?? "email";

  const failed = useQuery({
    queryKey: ["admin", "queues", selectedQueue, "failed", search.page],
    queryFn: () =>
      api.queue.listFailed({ queue: selectedQueue, page: search.page }),
    enabled: Boolean(overview.data),
    placeholderData: (phd) => phd,
  });

  const invalidate = async () =>
    await queryClient.invalidateQueries({ queryKey: ["admin", "queues"] });

  const retryJob = useMutation({
    mutationFn: (jobId: string) =>
      api.queue.retryJob({ queue: selectedQueue, jobId }),
    onError,
    onSuccess: async () => {
      toast.success(t("adminQueues.jobRetried"));
      await invalidate();
    },
  });

  const removeJob = useMutation({
    mutationFn: (jobId: string) =>
      api.queue.removeJob({ queue: selectedQueue, jobId }),
    onError,
    onSuccess: async () => {
      toast.success(t("adminQueues.jobRemoved"));
      await invalidate();
    },
  });

  const retryAll = useMutation({
    mutationFn: () => api.queue.retryAll({ queue: selectedQueue }),
    onError,
    onSuccess: async () => {
      toast.success(t("adminQueues.allRetried"));
      await invalidate();
    },
  });

  if (overview.isPending) return <Spinner />;
  if (overview.isError) throw overview.error;

  const failedJobs = failed.data?.jobs ?? [];

  return (
    <div className="space-y-6">
      <QueueCounts queues={overview.data.queues} />
      <FailedJobsTable
        currentPage={failed.data?.meta.page ?? search.page}
        isMutating={
          retryJob.isPending || removeJob.isPending || retryAll.isPending
        }
        isPending={failed.isPending}
        isRetryAllPending={retryAll.isPending}
        jobs={failedJobs}
        lastPage={failed.data?.meta.lastPage ?? 1}
        onPageChange={(page) =>
          navigate({ search: (current) => ({ ...current, page }) })
        }
        onRemove={(jobId) => removeJob.mutate(jobId)}
        onRetry={(jobId) => retryJob.mutate(jobId)}
        onRetryAll={() => retryAll.mutate()}
        removingJobId={removeJob.variables}
        retryingJobId={retryJob.variables}
      />
    </div>
  );
};

import { api } from "@/api";
import { DataPagination } from "@/components/data-pagination";
import { TableSkeleton } from "@/components/table-skeleton";
import { onError } from "@/lib/base-api";
import {
  stageNumbers,
  type CampaignStatus,
  type StageNumber,
} from "@/lib/campaign";
import { invalidateCampaignData } from "@/lib/invalidate";
import { adminCampaignRoute } from "@/routes/admin/campaign";
import { Badge } from "@repo/ui/components/ui/badge";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/ui/tabs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CampaignHeader } from "./campaign-header";
import { CampaignLeadFilters } from "./campaign-lead-filters";
import { CampaignLeadTable } from "./campaign-lead-table";
import { PipelineOverview } from "./pipeline-overview";
import { StagePanel } from "./stage-panel";

const allStages = "all";

const findStage = (value: string): StageNumber | undefined =>
  stageNumbers.find((stage) => String(stage) === value);

export const Campaign = () => {
  const { t } = useTranslation();
  const { campaignId } = adminCampaignRoute.useParams();
  const searchParams = adminCampaignRoute.useSearch();
  const navigate = adminCampaignRoute.useNavigate();
  const queryClient = useQueryClient();

  const campaign = useQuery({
    queryKey: ["admin", "campaigns", campaignId],
    queryFn: () => api.campaign.show({ campaignId }),
    placeholderData: (previousData) => previousData,
  });

  const leads = useQuery({
    queryKey: ["admin", "campaigns", campaignId, "leads", searchParams],
    queryFn: () => api.campaign.leads({ campaignId }, searchParams),
    placeholderData: (previousData) => previousData,
  });

  const setStatus = useMutation({
    mutationFn: (status: CampaignStatus) =>
      api.campaign.setStatus({ campaignId }, { status }),
    onError,
    onSuccess: async () => {
      toast.success(t("adminCampaign.statusUpdated"));
      await invalidateCampaignData(queryClient);
    },
  });

  const runStage = useMutation({
    mutationFn: (stage: StageNumber) =>
      api.campaign.runStage({ campaignId, stage }),
    onError,
    onSuccess: async (_, stage) => {
      toast.success(t("adminCampaign.stageProcessed", { number: stage }));
      await invalidateCampaignData(queryClient);
    },
  });

  const retryFailed = useMutation({
    mutationFn: (stage: StageNumber) =>
      api.campaign.retryFailed({ campaignId, stage }),
    onError,
    onSuccess: async () => {
      toast.success(t("adminCampaign.retried"));
      await invalidateCampaignData(queryClient);
    },
  });

  if (campaign.isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-40" />
        <div className="space-y-2">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-5 w-56" />
        </div>
        <Card>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
              {Array.from({ length: stageNumbers.length }, (_, index) => (
                <div className="space-y-2" key={index}>
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-8 w-12" />
                  <Skeleton className="h-1.5 w-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Skeleton className="h-9 w-full max-w-2xl" />
        <Card>
          <CardContent>
            <TableSkeleton columns={6} />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (campaign.isError) {
    throw campaign.error;
  }

  if (leads.isError) {
    throw leads.error;
  }

  const { stages } = campaign.data.campaign;
  const selectedStage = stages.find(
    (item) => item.stage === searchParams.stage,
  );

  return (
    <div className="space-y-6">
      <Link
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
        search={{ page: 1 }}
        to="/admin/campaigns"
      >
        <ArrowLeftIcon className="size-4" />
        {t("adminCampaign.back")}
      </Link>
      <CampaignHeader
        campaign={campaign.data.campaign}
        isStatusPending={setStatus.isPending}
        onStatusChange={(status) => setStatus.mutate(status)}
      />
      <PipelineOverview stages={stages} />
      <div className="overflow-x-auto">
        <Tabs
          onValueChange={(value) =>
            navigate({
              search: (current) => ({
                ...current,
                page: 1,
                stage: findStage(value),
              }),
            })
          }
          value={String(searchParams.stage ?? allStages)}
        >
          <TabsList variant="line">
            <TabsTrigger value={allStages}>
              {t("adminCampaign.allStages")}
              <Badge variant="secondary">
                {campaign.data.campaign.leadCount}
              </Badge>
            </TabsTrigger>
            {stages.map((stage) => (
              <TabsTrigger key={stage.stage} value={String(stage.stage)}>
                {t("adminCampaign.stage", { number: stage.stage })}
                <Badge variant="secondary">{stage.total}</Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      {selectedStage && (
        <StagePanel
          canRun={campaign.data.campaign.status === "active"}
          isRetrying={
            retryFailed.isPending &&
            retryFailed.variables === selectedStage.stage
          }
          isRunning={
            runStage.isPending && runStage.variables === selectedStage.stage
          }
          onRetry={() => retryFailed.mutate(selectedStage.stage)}
          onRun={() => runStage.mutate(selectedStage.stage)}
          stage={selectedStage}
        />
      )}
      <Card>
        <CardContent>
          <div className="space-y-4">
            <CampaignLeadFilters
              onSearch={(search) =>
                navigate({
                  search: (current) => ({ ...current, page: 1, search }),
                })
              }
              onStatusChange={(status) =>
                navigate({
                  search: (current) => ({ ...current, page: 1, status }),
                })
              }
              search={searchParams.search}
              status={searchParams.status}
            />
            {leads.isPending ? (
              <TableSkeleton columns={6} />
            ) : (
              <CampaignLeadTable leads={leads.data.leads} />
            )}
            <DataPagination
              currentPage={leads.data?.meta.page ?? 1}
              lastPage={leads.data?.meta.lastPage ?? 1}
              onPageChange={(page) =>
                navigate({ search: (current) => ({ ...current, page }) })
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

import { api } from "@/api";
import type { ScrapeRun } from "@/api/campaign";
import { DataPagination } from "@/components/data-pagination";
import { CardGridSkeleton } from "@/components/card-grid";
import { TableSkeleton } from "@/components/table-skeleton";
import { SelectionBar } from "@/components/selection-bar";
import { ExportButton } from "@/components/export-button";
import { ViewSwitch } from "@/components/view-switch";
import { onError } from "@/lib/base-api";
import {
  stageNumbers,
  type CampaignStatus,
  type StageNumber,
} from "@/lib/campaign";
import { invalidateCampaignData } from "@/lib/invalidate";
import { useSelection } from "@/lib/use-selection";
import { useView } from "@/lib/view";
import { adminCampaignRoute } from "@/routes/admin/campaign";
import { Badge } from "@repo/ui/components/ui/badge";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { ScrollArea, ScrollBar } from "@repo/ui/components/ui/scroll-area";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/ui/tabs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { toast } from "sonner";
import { CampaignHeader } from "./campaign-header";
import { CampaignLeadCards } from "./campaign-lead-cards";
import { CampaignLeadFilters } from "./campaign-lead-filters";
import { CampaignLeadTable } from "./campaign-lead-table";
import { PipelineOverview } from "./pipeline-overview";
import { AssessmentSheet } from "./assessment-sheet";
import { StagePanel } from "./stage-panel";

const allStages = "all";

const isScrapeActive = (run?: ScrapeRun) =>
  run?.status === "queued" || run?.status === "running";

const findStage = (value: string): StageNumber | undefined =>
  stageNumbers.find((stage) => String(stage) === value);

export const Campaign = () => {
  const { campaignId } = adminCampaignRoute.useParams();
  const searchParams = adminCampaignRoute.useSearch();
  const { view, setView } = useView();
  const navigate = adminCampaignRoute.useNavigate();
  const queryClient = useQueryClient();

  const campaign = useQuery({
    queryKey: ["admin", "campaigns", campaignId],
    queryFn: () => api.campaign.show({ campaignId }),
    placeholderData: (previousData) => previousData,
  });

  const isScraping = isScrapeActive(campaign.data?.scrapeRuns.at(0));

  const leads = useQuery({
    queryKey: ["admin", "campaigns", campaignId, "leads", searchParams],
    queryFn: () => api.campaign.leads({ campaignId }, searchParams),
    placeholderData: (previousData) => previousData,
  });

  const selection = useSelection(
    leads.data?.leads.map((lead) => lead.leadId) ?? [],
  );

  const setStatus = useMutation({
    mutationFn: (status: CampaignStatus) =>
      api.campaign.update({ campaignId }, { status }),
    onError,
    onSuccess: async () => {
      toast.success("Campaign status updated.");
      await invalidateCampaignData(queryClient);
    },
  });

  const [assessmentLeadId, setAssessmentLeadId] = useState<number>();

  const assessment = useQuery({
    queryKey: [
      "admin",
      "campaigns",
      campaignId,
      "assessment",
      assessmentLeadId,
    ],
    queryFn: () =>
      api.campaign.assessment({ campaignId, leadId: assessmentLeadId ?? 0 }),
    enabled: assessmentLeadId !== undefined,
    placeholderData: (previousData) => previousData,
  });

  const startFilter = useMutation({
    mutationFn: () => api.campaign.runFilter({ campaignId }),
    onError,
    onSuccess: async () => {
      toast.success("AI filter started.");
      selection.clear();
      await invalidateCampaignData(queryClient);
    },
  });

  const startEnrich = useMutation({
    mutationFn: () => api.campaign.runEnrich({ campaignId }),
    onError,
    onSuccess: async () => {
      toast.success("Web search started.");
      selection.clear();
      await invalidateCampaignData(queryClient);
    },
  });

  const startFindEmail = useMutation({
    mutationFn: () => api.campaign.runFindEmail({ campaignId }),
    onError,
    onSuccess: async () => {
      toast.success("Email search started.");
      selection.clear();
      await invalidateCampaignData(queryClient);
    },
  });

  const reapplyFilter = useMutation({
    mutationFn: () => api.campaign.reapplyFilter({ campaignId }),
    onError,
    onSuccess: async (result) => {
      toast.success(
        `Rules applied: ${result.changed} changed, ${result.skipped} need a new AI run.`,
      );
      await invalidateCampaignData(queryClient);
    },
  });

  const startScrape = useMutation({
    mutationFn: (replace: boolean) =>
      api.campaign.scrape({ campaignId }, { replace }),
    onError,
    onSuccess: async () => {
      toast.success("Scrape started.");
      selection.clear();
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
            <TableSkeleton columns={10} />
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
        Back to campaigns
      </Link>
      <CampaignHeader
        campaign={campaign.data.campaign}
        isStatusPending={setStatus.isPending}
        onStatusChange={(status) => setStatus.mutate(status)}
      />
      <PipelineOverview stages={stages} />
      <ScrollArea>
        <div className="pb-2">
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
                All stages
                <Badge variant="secondary">
                  {campaign.data.campaign.leadCount}
                </Badge>
              </TabsTrigger>
              {stages.map((stage) => (
                <TabsTrigger key={stage.stage} value={String(stage.stage)}>
                  {`Stage ${stage.stage}`}
                  <Badge variant="secondary">{stage.total}</Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      {selectedStage && (
        <StagePanel
          campaignId={campaignId}
          canRun={campaign.data.campaign.status === "active"}
          isFiltering={
            startFilter.isPending ||
            (stages.find((item) => item.stage === 2)?.running ?? 0) > 0
          }
          isEnriching={
            startEnrich.isPending ||
            (stages.find((item) => item.stage === 3)?.running ?? 0) > 0
          }
          isFindingEmail={
            startFindEmail.isPending ||
            (stages.find((item) => item.stage === 4)?.running ?? 0) > 0
          }
          onRunEnrich={() => startEnrich.mutate()}
          onRunFindEmail={() => startFindEmail.mutate()}
          onReapplyFilter={() => reapplyFilter.mutate()}
          isReapplying={reapplyFilter.isPending}
          onRunFilter={() => startFilter.mutate()}
          isRunning={startScrape.isPending || isScraping}
          onRun={(replace) => startScrape.mutate(replace)}
          scrapeRun={campaign.data.scrapeRuns.at(0)}
          stage={selectedStage}
        />
      )}
      <Card>
        <CardContent>
          <div className="space-y-4">
            <CampaignLeadFilters
              exportAction={
                <ExportButton
                  filename={`campaign-${campaignId}-leads`}
                  onExport={() =>
                    api.campaign.exportLeads({ campaignId }, searchParams)
                  }
                />
              }
              viewSwitch={<ViewSwitch onChange={setView} view={view} />}
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
            <SelectionBar
              disabled={isScraping}
              selection={selection}
              showSelectAll={view === "cards"}
            />
            {leads.isPending ? (
              view === "cards" ? (
                <CardGridSkeleton />
              ) : (
                <TableSkeleton columns={10} />
              )
            ) : view === "cards" ? (
              <CampaignLeadCards
                leads={leads.data.leads}
                onOpenAssessment={setAssessmentLeadId}
                selection={selection}
                selectionLocked={isScraping}
              />
            ) : (
              <CampaignLeadTable
                leads={leads.data.leads}
                onOpenAssessment={setAssessmentLeadId}
                selection={selection}
                selectionLocked={isScraping}
              />
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
      <AssessmentSheet
        assessment={assessment.data?.assessment}
        isError={assessment.isError}
        isOpen={assessmentLeadId !== undefined}
        isPending={assessment.isPending}
        leadName={
          leads.data?.leads.find((lead) => lead.leadId === assessmentLeadId)
            ?.name
        }
        onClose={() => setAssessmentLeadId(undefined)}
      />
    </div>
  );
};

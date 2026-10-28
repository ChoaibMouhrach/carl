import { api } from "@/api";
import { onError } from "@/lib/base-api";
import { perPageForUrl, resolvePageSize } from "@/lib/page-size";
import { adminCampaignRoute } from "@/routes/admin/campaign";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheckIcon, ScanSearchIcon, SparklesIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { TableSkeleton } from "@/components/table-skeleton";
import { runStatus } from "./pipeline-step";
import { PipelineStepper } from "./pipeline-stepper";
import { ScrapeResults } from "./scrape-results";
import { ScrapeStep } from "./scrape-step";
import { StepPlaceholder } from "./step-placeholder";
import { TavilyResults } from "./tavily-results";
import { TavilyStep } from "./tavily-step";

type CampaignDetails = Awaited<ReturnType<typeof api.campaign.show>>;

const POLL_MS = 2_000;

interface PipelineProps {
  campaign: CampaignDetails;
}

export const Pipeline = ({ campaign }: PipelineProps) => {
  const { campaignId } = campaign;
  const searchParams = adminCampaignRoute.useSearch();
  const routeNavigate = adminCampaignRoute.useNavigate();
  const queryClient = useQueryClient();
  const { step, page } = searchParams;
  const perPage = resolvePageSize(searchParams.perPage);

  const pipeline = useQuery({
    queryKey: ["admin", "campaigns", campaignId, "pipeline"],
    queryFn: () => api.campaign.pipeline({ campaignId }),
    placeholderData: (previousData) => previousData,
    refetchInterval: (query) =>
      query.state.data?.scrape?.status === "running" ||
      query.state.data?.enrich?.status === "running"
        ? POLL_MS
        : false,
  });

  const scrapeStatus = runStatus(pipeline.data?.scrape ?? null);
  const enrichStatus = runStatus(pipeline.data?.enrich ?? null);
  const isRunning = scrapeStatus === "running" || enrichStatus === "running";

  const communities = useQuery({
    queryKey: ["admin", "communities", "campaign", campaignId, page, perPage],
    queryFn: () => api.community.list({ campaignId, page, perPage }),
    enabled: step === "scrape",
    placeholderData: (previousData) => previousData,
    refetchInterval: isRunning ? POLL_MS : false,
  });

  const leads = useQuery({
    queryKey: ["admin", "leads", "campaign", campaignId, page, perPage],
    queryFn: () => api.lead.list({ campaignId, page, perPage }),
    enabled: step === "tavily",
    placeholderData: (previousData) => previousData,
    refetchInterval: isRunning ? POLL_MS : false,
  });

  const wasRunning = useRef(false);

  useEffect(() => {
    if (wasRunning.current && !isRunning) {
      void queryClient.invalidateQueries({
        queryKey: ["admin", "campaigns", campaignId],
        exact: true,
      });
    }

    wasRunning.current = isRunning;
  }, [isRunning, campaignId, queryClient]);

  const refreshPipeline = () =>
    queryClient.invalidateQueries({
      queryKey: ["admin", "campaigns", campaignId, "pipeline"],
    });

  const startScrape = useMutation({
    mutationFn: () => api.campaign.startScrape({ campaignId }),
    onError,
    onSuccess: refreshPipeline,
  });

  const startEnrich = useMutation({
    mutationFn: () => api.campaign.startEnrich({ campaignId }),
    onError,
    onSuccess: refreshPipeline,
  });

  const selectStep = (next: typeof step) =>
    routeNavigate({
      search: (current) => ({ ...current, step: next, page: 1 }),
    });

  if (pipeline.isPending) {
    return (
      <section className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton className="h-16" key={index} />
          ))}
        </div>
        <Skeleton className="h-9 w-full" />
        <TableSkeleton columns={4} />
      </section>
    );
  }

  if (pipeline.isError) {
    throw pipeline.error;
  }

  if (step === "scrape" && communities.isError) {
    throw communities.error;
  }

  if (step === "tavily" && leads.isError) {
    throw leads.error;
  }

  const state = pipeline.data;
  const isScrapeDone = state.scrape?.status === "done";

  const paging = {
    perPage,
    onPageChange: (next: number) =>
      routeNavigate({ search: (current) => ({ ...current, page: next }) }),
    onPerPageChange: (size: Parameters<typeof perPageForUrl>[0]) =>
      routeNavigate({
        search: (current) => ({
          ...current,
          page: 1,
          perPage: perPageForUrl(size),
        }),
      }),
  };

  return (
    <section className="space-y-6">
      <PipelineStepper
        isScrapeDone={isScrapeDone}
        onSelect={selectStep}
        scrapeCount={isScrapeDone ? campaign.communitiesCount : null}
        scrapeStatus={scrapeStatus}
        selected={step}
        tavilyCount={
          state.enrich?.status === "done" ? state.contactableCount : null
        }
        tavilyStatus={enrichStatus}
      />
      {step === "scrape" && (
        <>
          <ScrapeStep
            campaign={campaign}
            isStarting={startScrape.isPending}
            onRun={() => startScrape.mutate()}
            run={state.scrape}
          />
          {communities.data ? (
            <ScrapeResults
              communities={communities.data.communities}
              meta={communities.data.meta}
              {...paging}
            />
          ) : (
            <TableSkeleton columns={4} />
          )}
        </>
      )}
      {step === "tavily" &&
        (isScrapeDone ? (
          <>
            <TavilyStep
              isAvailable={state.enrichmentAvailable}
              isStarting={startEnrich.isPending}
              leadsCount={campaign.leadsCount}
              onRun={() => startEnrich.mutate()}
              run={state.enrich}
            />
            {leads.data ? (
              <TavilyResults
                contactableCount={state.contactableCount}
                leads={leads.data.leads}
                meta={leads.data.meta}
                {...paging}
              />
            ) : (
              <TableSkeleton columns={5} />
            )}
          </>
        ) : (
          <StepPlaceholder
            action={{
              label: "Go to Scrape",
              tip: "Open the scrape step",
              onClick: () => selectStep("scrape"),
            }}
            description="Tavily researches the leads the scrape found, so finish a scrape first."
            icon={<ScanSearchIcon />}
            title="Waiting for the scrape"
          />
        ))}
      {step === "ai-filter" && (
        <StepPlaceholder
          description="Each community will be classified here once this step is built."
          icon={<SparklesIcon />}
          title="AI filter is coming soon"
        />
      )}
      {step === "accepted" && (
        <StepPlaceholder
          description="The communities that pass the AI filter will be listed here."
          icon={<CircleCheckIcon />}
          title="Accepted is coming soon"
        />
      )}
    </section>
  );
};

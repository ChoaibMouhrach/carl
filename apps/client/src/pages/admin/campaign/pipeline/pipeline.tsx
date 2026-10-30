import { api } from "@/api";
import { usePipelineEvents } from "@/hooks/use-pipeline-events";
import { onError } from "@/lib/base-api";
import { adminCampaignRoute } from "@/routes/admin/campaign";
import {
  Alert,
  AlertTitle,
  AlertDescription,
} from "@repo/ui/components/ui/alert";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GlobeIcon, MailSearchIcon, ScanSearchIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { TableSkeleton } from "@/components/table-skeleton";
import { runStatus } from "./pipeline-step";
import { PipelineStepper } from "./pipeline-stepper";
import { CampaignLeads } from "../campaign-leads";
import { FullEnrichStep } from "./fullenrich-step";
import { ScrapeStep } from "./scrape-step";
import { WebsiteStep } from "./website-step";
import { StepPlaceholder } from "./step-placeholder";
import { TavilyStep } from "./tavily-step";

type CampaignDetails = Awaited<ReturnType<typeof api.campaign.show>>;

interface PipelineProps {
  campaign: CampaignDetails;
}

export const Pipeline = ({ campaign }: PipelineProps) => {
  const { campaignId } = campaign;
  const searchParams = adminCampaignRoute.useSearch();
  const routeNavigate = adminCampaignRoute.useNavigate();
  const queryClient = useQueryClient();
  const { step } = searchParams;

  const pipeline = useQuery({
    queryKey: ["admin", "campaigns", campaignId, "pipeline"],
    queryFn: () => api.campaign.pipeline({ campaignId }),
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[2] === campaignId ? previousData : undefined,
  });

  usePipelineEvents(campaignId);

  const scrapeStatus = runStatus(pipeline.data?.scrape ?? null);
  const enrichStatus = runStatus(pipeline.data?.enrich ?? null);
  const websiteStatus = runStatus(pipeline.data?.website ?? null);
  const fullenrichStatus = runStatus(pipeline.data?.fullenrich ?? null);

  const revision = JSON.stringify([
    campaignId,
    pipeline.data?.scrape,
    pipeline.data?.enrich,
    pipeline.data?.website,
    pipeline.data?.fullenrich,
  ]);
  const previousRevision = useRef(revision);

  useEffect(() => {
    if (previousRevision.current !== revision) {
      void queryClient.invalidateQueries({
        queryKey: ["admin", "campaigns", campaignId],
        exact: true,
      });
      void queryClient.invalidateQueries({ queryKey: ["admin", "leads"] });
    }
    previousRevision.current = revision;
  }, [revision, campaignId, queryClient]);

  const refreshPipeline = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["admin", "campaigns", campaignId],
    });
    await queryClient.invalidateQueries({ queryKey: ["admin", "leads"] });
  };

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

  const startWebsite = useMutation({
    mutationFn: () => api.campaign.startWebsite({ campaignId }),
    onError,
    onSuccess: refreshPipeline,
  });

  const startFullEnrich = useMutation({
    mutationFn: () => api.campaign.startFullEnrich({ campaignId }),
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
        <div className="grid gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton className="h-16" key={index} />
          ))}
        </div>
        <Skeleton className="h-9 w-full" />
        <Card>
          <CardContent>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-9 w-72" />
                <Skeleton className="h-9 w-32" />
                <Skeleton className="h-9 w-36" />
                <Skeleton className="ml-auto h-9 w-28" />
              </div>
              <Skeleton className="h-5 w-24" />
              <TableSkeleton columns={6} />
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }

  if (pipeline.isError) {
    throw pipeline.error;
  }

  const state = pipeline.data;
  const isScrapeDone =
    state.scrape?.status === "done" && state.scrape.itemsReady;
  const isTavilyDone =
    state.enrich?.status === "done" && state.enrich.itemsReady;
  const selectedRun =
    step === "scrape"
      ? state.scrape
      : step === "tavily"
        ? state.enrich
        : step === "website"
          ? state.website
          : state.fullenrich;

  return (
    <section className="space-y-6">
      <PipelineStepper
        fullenrichCount={
          state.fullenrich?.status === "done" ? state.emailedCount : null
        }
        fullenrichStatus={fullenrichStatus}
        isScrapeDone={isScrapeDone}
        isTavilyDone={isTavilyDone}
        onSelect={selectStep}
        scrapeCount={isScrapeDone ? state.scrapedCount : null}
        scrapeStatus={scrapeStatus}
        selected={step}
        tavilyCount={
          state.enrich?.status === "done" ? state.contactableCount : null
        }
        tavilyStatus={enrichStatus}
        websiteCount={
          state.website?.status === "done" ? state.websiteEmailedCount : null
        }
        websiteStatus={websiteStatus}
      />
      {step === "scrape" && (
        <ScrapeStep
          campaign={campaign}
          isStarting={startScrape.isPending}
          onRun={() => startScrape.mutate()}
          run={state.scrape}
        />
      )}
      {step === "tavily" &&
        (isScrapeDone ? (
          <TavilyStep
            isAvailable={state.enrichmentAvailable}
            isStarting={startEnrich.isPending}
            leadsCount={campaign.leadsCount}
            onRun={() => startEnrich.mutate()}
            run={state.enrich}
          />
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
      {step === "website" &&
        (isTavilyDone ? (
          <WebsiteStep
            isStarting={startWebsite.isPending}
            onRun={() => startWebsite.mutate()}
            run={state.website}
            websiteCount={state.websiteCount}
          />
        ) : (
          <StepPlaceholder
            action={{
              label: "Go to Tavily",
              tip: "Open the Tavily step",
              onClick: () => selectStep("tavily"),
            }}
            description="The website step scrapes the sites Tavily found for emails, so finish a Tavily enrichment first."
            icon={<GlobeIcon />}
            title="Waiting for Tavily"
          />
        ))}
      {step === "fullenrich" &&
        (isTavilyDone ? (
          <FullEnrichStep
            contactableCount={state.contactableCount}
            isAvailable={state.emailEnrichmentAvailable}
            isStarting={startFullEnrich.isPending}
            onRun={() => startFullEnrich.mutate()}
            run={state.fullenrich}
          />
        ) : (
          <StepPlaceholder
            action={{
              label: "Go to Tavily",
              tip: "Open the Tavily step",
              onClick: () => selectStep("tavily"),
            }}
            description="FullEnrich looks up emails for the leads Tavily found a website or LinkedIn profile for, so finish a Tavily enrichment first."
            icon={<MailSearchIcon />}
            title="Waiting for Tavily"
          />
        ))}
      {selectedRun &&
        !selectedRun.itemsReady &&
        selectedRun.status !== "running" && (
          <Alert>
            <AlertTitle>Run this step again</AlertTitle>
            <AlertDescription>
              This run predates saved pipeline results. Run it again to populate
              this list.
            </AlertDescription>
          </Alert>
        )}
      <CampaignLeads />
    </section>
  );
};

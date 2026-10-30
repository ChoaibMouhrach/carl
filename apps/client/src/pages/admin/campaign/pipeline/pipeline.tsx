import { api } from "@/api";
import { usePipelineEvents } from "@/hooks/use-pipeline-events";
import { onError } from "@/lib/base-api";
import { adminCampaignRoute } from "@/routes/admin/campaign";
import type { LeadStage } from "@repo/constants/pipeline";
import { Label } from "@repo/ui/components/ui/label";
import { Switch } from "@repo/ui/components/ui/switch";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { TableSkeleton } from "@/components/table-skeleton";
import { CampaignLeads } from "../campaign-leads";
import { Funnel } from "./funnel";
import { StepCard } from "./step-card";

type CampaignDetails = Awaited<ReturnType<typeof api.campaign.show>>;

interface PipelineProps {
  campaign: CampaignDetails;
}

export const Pipeline = ({ campaign }: PipelineProps) => {
  const { campaignId } = campaign;
  const searchParams = adminCampaignRoute.useSearch();
  const routeNavigate = adminCampaignRoute.useNavigate();
  const queryClient = useQueryClient();
  const { stage } = searchParams;
  const [includeProcessed, setIncludeProcessed] = useState(false);

  const pipeline = useQuery({
    queryKey: ["admin", "campaigns", campaignId, "pipeline"],
    queryFn: () => api.campaign.pipeline({ campaignId }),
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[2] === campaignId ? previousData : undefined,
  });

  usePipelineEvents(campaignId);

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
    mutationFn: () =>
      api.campaign.startEnrich({ campaignId }, { includeProcessed }),
    onError,
    onSuccess: refreshPipeline,
  });

  const startWebsite = useMutation({
    mutationFn: () =>
      api.campaign.startWebsite({ campaignId }, { includeProcessed }),
    onError,
    onSuccess: refreshPipeline,
  });

  const startFullEnrich = useMutation({
    mutationFn: () =>
      api.campaign.startFullEnrich({ campaignId }, { includeProcessed }),
    onError,
    onSuccess: refreshPipeline,
  });

  const selectStage = (next: LeadStage | undefined) =>
    routeNavigate({
      search: (current) => ({ ...current, stage: next, page: 1 }),
    });

  if (pipeline.isPending) {
    return (
      <section className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton className="h-24" key={index} />
          ))}
        </div>
        <Skeleton className="h-6 w-64" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton className="h-36" key={index} />
          ))}
        </div>
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
  const eligible = includeProcessed
    ? state.funnel.eligibleWithProcessed
    : state.funnel.eligible;

  return (
    <section className="space-y-6">
      <Funnel funnel={state.funnel} onSelect={selectStage} selected={stage} />
      <div className="flex items-center gap-2">
        <Switch
          checked={includeProcessed}
          id="include-processed"
          onCheckedChange={setIncludeProcessed}
        />
        <Label htmlFor="include-processed">
          Include leads a step already tried
        </Label>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StepCard
          actionLabel={state.scrape ? "Run again" : "Run scrape"}
          badge="Adds leads"
          blockedReason={
            campaign.isActive
              ? undefined
              : "Activate the campaign to run its pipeline"
          }
          isStarting={startScrape.isPending}
          onRun={() => startScrape.mutate()}
          rule={`Searches Skool for “${campaign.keyword}”. Existing leads are kept.`}
          run={state.scrape}
          runningLabel="Searching Skool…"
          title="1. Scrape"
          unit="communities"
        />
        <StepCard
          actionLabel={`Run on ${eligible.enrich}`}
          badge={`${eligible.enrich} to research`}
          blockedReason={
            !state.enrichmentAvailable
              ? "Set TAVILY_API_KEY on the server to enable enrichment"
              : eligible.enrich === 0
                ? "Every lead has already been researched"
                : undefined
          }
          isStarting={startEnrich.isPending}
          onRun={() => startEnrich.mutate()}
          rule="Researches leads that have no LinkedIn and were not researched yet."
          run={state.enrich}
          runningLabel="Starting…"
          title="2. Tavily"
          unit="leads"
        />
        <StepCard
          actionLabel={`Run on ${eligible.website}`}
          badge={`${eligible.website} eligible`}
          blockedReason={
            eligible.website === 0
              ? "No lead with a website is missing an email"
              : undefined
          }
          isStarting={startWebsite.isPending}
          onRun={() => startWebsite.mutate()}
          rule="Free. Scrapes the website of leads that have one and no email."
          run={state.website}
          runningLabel="Starting…"
          title="3. Website"
          unit="leads"
        />
        <StepCard
          actionLabel={`Run on ${eligible.fullenrich}`}
          badge={`${eligible.fullenrich} eligible`}
          blockedReason={
            !state.emailEnrichmentAvailable
              ? "Set FULLENRICH_API_KEY on the server to enable email lookup"
              : eligible.fullenrich === 0
                ? "No contactable lead is missing an email"
                : undefined
          }
          isStarting={startFullEnrich.isPending}
          onRun={() => startFullEnrich.mutate()}
          rule="Paid. Looks up emails only for contactable leads that still have none."
          run={state.fullenrich}
          runningLabel="Starting…"
          title="4. FullEnrich"
          unit="leads"
        />
      </div>
      <CampaignLeads />
    </section>
  );
};

import { api } from "@/api";
import { Tip } from "@/components/tip";
import { formatCurrency, formatNumber } from "@/lib/format";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { PlayIcon, RotateCcwIcon } from "lucide-react";
import { RunProgress } from "./run-progress";
import { runStatus } from "./pipeline-step";

type CampaignDetails = Awaited<ReturnType<typeof api.campaign.show>>;
type PipelineState = Awaited<ReturnType<typeof api.campaign.pipeline>>;

interface ScrapeStepProps {
  campaign: CampaignDetails;
  run: PipelineState["scrape"];
  isStarting: boolean;
  onRun: () => void;
}

export const ScrapeStep = ({
  campaign,
  run,
  isStarting,
  onRun,
}: ScrapeStepProps) => {
  const status = runStatus(run);
  const isRunning = status === "running";
  const hasRun = status !== "idle";
  const disabled = isStarting || isRunning || !campaign.isActive;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{`Searches “${campaign.keyword}”`}</Badge>
          <Badge variant="secondary">
            {!campaign.minPriceCents
              ? "Any price"
              : `${formatCurrency(campaign.minPriceCents / 100, "USD")}+ / month`}
          </Badge>
          <Badge variant="secondary">
            {!campaign.minMembers
              ? "Any size"
              : `${formatNumber(campaign.minMembers)}+ members`}
          </Badge>
        </div>
        <Tip
          label={
            !campaign.isActive
              ? "Activate the campaign to run its pipeline"
              : isRunning
                ? "A scrape is already running"
                : "Search Skool with the campaign's filters"
          }
          render={<Button disabled={disabled} onClick={onRun} />}
        >
          {isStarting || isRunning ? (
            <Spinner />
          ) : hasRun ? (
            <RotateCcwIcon />
          ) : (
            <PlayIcon />
          )}
          {hasRun ? "Run again" : "Run scrape"}
        </Tip>
      </div>
      {run && (
        <RunProgress
          run={run}
          runningLabel="Searching Skool…"
          unit="communities"
        />
      )}
    </div>
  );
};

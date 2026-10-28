import { api } from "@/api";
import { Tip } from "@/components/tip";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { GlobeIcon, PlayIcon, RotateCcwIcon } from "lucide-react";
import { runStatus } from "./pipeline-step";
import { RunProgress } from "./run-progress";

type PipelineState = Awaited<ReturnType<typeof api.campaign.pipeline>>;

interface TavilyStepProps {
  leadsCount: number;
  run: PipelineState["enrich"];
  isAvailable: boolean;
  isStarting: boolean;
  onRun: () => void;
}

export const TavilyStep = ({
  leadsCount,
  run,
  isAvailable,
  isStarting,
  onRun,
}: TavilyStepProps) => {
  const status = runStatus(run);
  const isRunning = status === "running";
  const hasRun = status !== "idle";
  const disabled = isStarting || isRunning || !isAvailable;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            <GlobeIcon />
            Tavily web search
          </Badge>
          <Badge variant="secondary">{`${leadsCount} leads to research`}</Badge>
          <Badge variant="secondary">Finds website, LinkedIn and email</Badge>
        </div>
        <Tip
          label={
            !isAvailable
              ? "Set TAVILY_API_KEY on the server to enable enrichment"
              : isRunning
                ? "Enrichment is already running"
                : "Search the web for each lead's contact details"
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
          {hasRun ? "Run again" : "Run enrichment"}
        </Tip>
      </div>
      {run && <RunProgress run={run} runningLabel="Starting…" unit="leads" />}
    </div>
  );
};

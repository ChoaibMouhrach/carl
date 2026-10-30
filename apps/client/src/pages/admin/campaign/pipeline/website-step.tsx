import { api } from "@/api";
import { Tip } from "@/components/tip";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { GlobeIcon, PlayIcon, RotateCcwIcon } from "lucide-react";
import { runStatus } from "./pipeline-step";
import { RunProgress } from "./run-progress";

type PipelineState = Awaited<ReturnType<typeof api.campaign.pipeline>>;

interface WebsiteStepProps {
  websiteCount: number;
  run: PipelineState["website"];
  isStarting: boolean;
  onRun: () => void;
}

export const WebsiteStep = ({
  websiteCount,
  run,
  isStarting,
  onRun,
}: WebsiteStepProps) => {
  const status = runStatus(run);
  const isRunning = status === "running";
  const hasRun = status !== "idle";
  const disabled = isStarting || isRunning;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            <GlobeIcon />
            Website scrape
          </Badge>
          <Badge variant="secondary">{`${websiteCount} websites to scrape`}</Badge>
          <Badge variant="secondary">Checks /, /support and /contact</Badge>
        </div>
        <Tip
          label={
            isRunning
              ? "Website scrape is already running"
              : "Scrape each lead's website for an email address"
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
          {hasRun ? "Run again" : "Scrape websites"}
        </Tip>
      </div>
      {run && <RunProgress run={run} runningLabel="Starting…" unit="leads" />}
    </div>
  );
};

import { api } from "@/api";
import { Tip } from "@/components/tip";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { MailIcon, PlayIcon, RotateCcwIcon } from "lucide-react";
import { runStatus } from "./pipeline-step";
import { RunProgress } from "./run-progress";

type PipelineState = Awaited<ReturnType<typeof api.campaign.pipeline>>;

interface FullEnrichStepProps {
  contactableCount: number;
  run: PipelineState["fullenrich"];
  isAvailable: boolean;
  isStarting: boolean;
  onRun: () => void;
}

export const FullEnrichStep = ({
  contactableCount,
  run,
  isAvailable,
  isStarting,
  onRun,
}: FullEnrichStepProps) => {
  const status = runStatus(run);
  const isRunning = status === "running";
  const hasRun = status !== "idle";
  const disabled = isStarting || isRunning || !isAvailable;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            <MailIcon />
            FullEnrich
          </Badge>
          <Badge variant="secondary">{`${contactableCount} leads to look up`}</Badge>
          <Badge variant="secondary">Finds work and personal emails</Badge>
        </div>
        <Tip
          label={
            !isAvailable
              ? "Set FULLENRICH_API_KEY on the server to enable email lookup"
              : isRunning
                ? "Email lookup is already running"
                : "Look up each lead's work and personal email"
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
          {hasRun ? "Run again" : "Find emails"}
        </Tip>
      </div>
      {run && <RunProgress run={run} runningLabel="Starting…" unit="leads" />}
    </div>
  );
};

import { api } from "@/api";
import { Tip } from "@/components/tip";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { PlayIcon, RotateCcwIcon } from "lucide-react";
import { runStatus } from "./pipeline-step";
import { RunProgress } from "./run-progress";

type PipelineState = Awaited<ReturnType<typeof api.campaign.pipeline>>;

interface StepCardProps {
  title: string;
  rule: string;
  badge: string;
  actionLabel: string;
  run: PipelineState["scrape"];
  runningLabel: string;
  unit: string;
  isStarting: boolean;
  onRun: () => void;
  blockedReason?: string;
}

export const StepCard = ({
  title,
  rule,
  badge,
  actionLabel,
  run,
  runningLabel,
  unit,
  isStarting,
  onRun,
  blockedReason,
}: StepCardProps) => {
  const isRunning = runStatus(run) === "running";
  const disabled = isStarting || isRunning || blockedReason !== undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{rule}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <Badge variant="secondary">{badge}</Badge>
            <Tip
              label={
                blockedReason ??
                (isRunning ? "This step is already running" : rule)
              }
              render={<Button disabled={disabled} onClick={onRun} size="sm" />}
            >
              {isStarting || isRunning ? (
                <Spinner />
              ) : run ? (
                <RotateCcwIcon />
              ) : (
                <PlayIcon />
              )}
              {actionLabel}
            </Tip>
          </div>
          {run && (
            <RunProgress run={run} runningLabel={runningLabel} unit={unit} />
          )}
        </div>
      </CardContent>
    </Card>
  );
};

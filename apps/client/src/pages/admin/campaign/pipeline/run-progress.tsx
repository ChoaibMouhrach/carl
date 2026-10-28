import { api } from "@/api";
import { formatNumber } from "@/lib/format";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/ui/components/ui/alert";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@repo/ui/components/ui/progress";
import { TriangleAlertIcon } from "lucide-react";

type PipelineState = Awaited<ReturnType<typeof api.campaign.pipeline>>;
type Run = NonNullable<PipelineState["scrape"]>;

interface RunProgressProps {
  run: Run;
  runningLabel: string;
  unit: string;
}

export const RunProgress = ({ run, runningLabel, unit }: RunProgressProps) => {
  const finished = run.processed + run.failed;
  const percent =
    run.status === "done"
      ? 100
      : run.total === 0
        ? 0
        : Math.round((finished / run.total) * 100);

  return (
    <div className="space-y-4">
      {run.status === "running" && (
        <Progress value={percent}>
          <ProgressLabel>
            {run.total === 0
              ? runningLabel
              : `${formatNumber(finished)} of ${formatNumber(run.total)} ${unit}`}
          </ProgressLabel>
          <ProgressValue />
        </Progress>
      )}
      {run.status === "failed" && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>The run failed</AlertTitle>
          <AlertDescription>
            {run.error ?? "Something went wrong. Try again."}
          </AlertDescription>
        </Alert>
      )}
      {run.status !== "running" && run.failed > 0 && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>{`${formatNumber(run.failed)} ${unit} could not be processed`}</AlertTitle>
          <AlertDescription>Run the step again to retry them.</AlertDescription>
        </Alert>
      )}
    </div>
  );
};

import type { StageCount } from "@/api/campaign";
import { formatNumber } from "@/lib/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Progress } from "@repo/ui/components/ui/progress";

interface PipelineOverviewProps {
  stages: StageCount[];
}

export const PipelineOverview = ({ stages }: PipelineOverviewProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipeline</CardTitle>
        <CardDescription>
          Where every lead in this campaign currently stands.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-8">
          {stages.map((stage) => (
            <div className="space-y-2" key={stage.stage}>
              <div className="text-sm text-muted-foreground">
                {`Stage ${stage.stage}`}
              </div>
              <div className="text-2xl font-semibold tabular-nums">
                {formatNumber(stage.total)}
              </div>
              <Progress
                aria-label={`Stage ${stage.stage}`}
                value={stage.total === 0 ? 0 : (stage.done / stage.total) * 100}
              />
              <div className="h-4 text-xs text-destructive">
                {stage.failed > 0 && `${stage.failed} failed`}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

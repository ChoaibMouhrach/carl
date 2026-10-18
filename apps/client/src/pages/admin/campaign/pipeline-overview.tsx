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
import { useTranslation } from "react-i18next";

interface PipelineOverviewProps {
  stages: StageCount[];
}

export const PipelineOverview = ({ stages }: PipelineOverviewProps) => {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("adminCampaign.pipelineTitle")}</CardTitle>
        <CardDescription>
          {t("adminCampaign.pipelineDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-8">
          {stages.map((stage) => (
            <div className="space-y-2" key={stage.stage}>
              <div className="text-sm text-muted-foreground">
                {t("adminCampaign.stage", { number: stage.stage })}
              </div>
              <div className="text-2xl font-semibold tabular-nums">
                {formatNumber(stage.total)}
              </div>
              <Progress
                aria-label={t("adminCampaign.stage", { number: stage.stage })}
                value={stage.total === 0 ? 0 : (stage.done / stage.total) * 100}
              />
              <div className="h-4 text-xs text-destructive">
                {stage.failed > 0 &&
                  t("adminCampaign.failedCount", { count: stage.failed })}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

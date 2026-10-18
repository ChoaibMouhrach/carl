import type { StageCount } from "@/api/campaign";
import { formatNumber } from "@/lib/format";
import { leadStatuses } from "@/lib/campaign";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Progress } from "@repo/ui/components/ui/progress";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { PlayIcon, RotateCcwIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

interface StagePanelProps {
  canRun: boolean;
  isRetrying: boolean;
  isRunning: boolean;
  onRetry: () => void;
  onRun: () => void;
  stage: StageCount;
}

export const StagePanel = ({
  canRun,
  isRetrying,
  isRunning,
  onRetry,
  onRun,
  stage,
}: StagePanelProps) => {
  const { t } = useTranslation();
  const isBusy = isRunning || isRetrying;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t("adminCampaign.stageTitle", { number: stage.stage })}
        </CardTitle>
        <CardDescription>
          {canRun
            ? t("adminCampaign.stageDescription")
            : t("adminCampaign.inactiveHint")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <div>
              <div className="text-sm text-muted-foreground">
                {t("adminCampaign.ready")}
              </div>
              <div className="text-2xl font-semibold tabular-nums">
                {formatNumber(stage.ready)}
              </div>
            </div>
            {leadStatuses.map((status) => (
              <div key={status}>
                <div className="text-sm text-muted-foreground">
                  {t(`adminCampaign.leadStatus.${status}`)}
                </div>
                <div className="text-2xl font-semibold tabular-nums">
                  {formatNumber(stage[status])}
                </div>
              </div>
            ))}
          </div>
          <Progress
            aria-label={t("adminCampaign.completedLabel")}
            value={stage.total === 0 ? 0 : (stage.done / stage.total) * 100}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!canRun || stage.ready === 0 || isBusy}
              onClick={onRun}
            >
              {isRunning ? <Spinner /> : <PlayIcon />}
              {t("adminCampaign.runStage")}
            </Button>
            <Button
              disabled={stage.failed === 0 || isBusy}
              onClick={onRetry}
              variant="outline"
            >
              {isRetrying ? <Spinner /> : <RotateCcwIcon />}
              {t("adminCampaign.retryFailed")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

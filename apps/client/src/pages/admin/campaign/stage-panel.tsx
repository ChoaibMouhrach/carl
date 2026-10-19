import type { ScrapeRun, StageCount } from "@/api/campaign";
import { formatNumber } from "@/lib/format";
import { leadStatuses } from "@/lib/campaign";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/ui/components/ui/alert-dialog";
import { Badge } from "@repo/ui/components/ui/badge";
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
import { PlayIcon, RefreshCwIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

const FIRST_STAGE = 1;

interface StagePanelProps {
  canRun: boolean;
  isRunning: boolean;
  onRun: (replace: boolean) => void;
  scrapeRun?: ScrapeRun;
  stage: StageCount;
}

export const StagePanel = ({
  canRun,
  isRunning,
  onRun,
  scrapeRun,
  stage,
}: StagePanelProps) => {
  const { t } = useTranslation();
  const canStart = stage.stage === FIRST_STAGE;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t("adminCampaign.stageTitle", { number: stage.stage })}
        </CardTitle>
        <CardDescription>
          {canStart && !canRun
            ? t("adminCampaign.inactiveHint")
            : t("adminCampaign.stageDescription")}
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
          {canStart && (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                disabled={!canRun || isRunning}
                onClick={() => onRun(false)}
              >
                {isRunning ? <Spinner /> : <PlayIcon />}
                {t("adminCampaign.runScrape")}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button disabled={!canRun || isRunning} variant="outline" />
                  }
                >
                  <RefreshCwIcon />
                  {t("adminCampaign.replaceScrape")}
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t("adminCampaign.replaceTitle")}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("adminCampaign.replaceDescription")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>
                      {t("adminCampaign.cancel")}
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => onRun(true)}
                      variant="destructive"
                    >
                      {t("adminCampaign.replaceConfirm")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              {scrapeRun && (
                <>
                  <Badge
                    variant={
                      scrapeRun.status === "failed"
                        ? "destructive"
                        : scrapeRun.status === "completed"
                          ? "default"
                          : "secondary"
                    }
                  >
                    {t(`adminCampaign.scrapeStatus.${scrapeRun.status}`)}
                  </Badge>
                  {scrapeRun.summary && (
                    <span className="text-sm text-muted-foreground">
                      {t("adminCampaign.scrapeSummary", {
                        discovered: formatNumber(scrapeRun.summary.discovered),
                        created: formatNumber(
                          scrapeRun.summary.communitiesCreated,
                        ),
                        attached: formatNumber(scrapeRun.summary.leadsAttached),
                        removed: formatNumber(
                          scrapeRun.summary.leadsRemoved ?? 0,
                        ),
                        filtered: formatNumber(
                          scrapeRun.summary.filteredOut ?? 0,
                        ),
                        failed: formatNumber(scrapeRun.summary.failures.length),
                      })}
                    </span>
                  )}
                  {scrapeRun.error && (
                    <span className="text-sm text-destructive">
                      {scrapeRun.error}
                    </span>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

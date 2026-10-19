import type { ScrapeRun, StageCount } from "@/api/campaign";
import { leadStatusLabels } from "@/lib/campaign";
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
  const canStart = stage.stage === FIRST_STAGE;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{`Stage ${stage.stage}`}</CardTitle>
        <CardDescription>
          {canStart && !canRun
            ? "Activate the campaign to run its stages."
            : "Run this stage for every lead that is ready for it."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <div>
              <div className="text-sm text-muted-foreground">Ready to run</div>
              <div className="text-2xl font-semibold tabular-nums">
                {formatNumber(stage.ready)}
              </div>
            </div>
            {leadStatuses.map((status) => (
              <div key={status}>
                <div className="text-sm text-muted-foreground">
                  {leadStatusLabels[status]}
                </div>
                <div className="text-2xl font-semibold tabular-nums">
                  {formatNumber(stage[status])}
                </div>
              </div>
            ))}
          </div>
          <Progress
            aria-label="Completed"
            value={stage.total === 0 ? 0 : (stage.done / stage.total) * 100}
          />
          {canStart && (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                disabled={!canRun || isRunning}
                onClick={() => onRun(false)}
              >
                {isRunning ? <Spinner /> : <PlayIcon />}
                Run scrape
              </Button>
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button disabled={!canRun || isRunning} variant="outline" />
                  }
                >
                  <RefreshCwIcon />
                  Replace leads and scrape
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Replace leads and scrape?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Leads from earlier scrapes that are still at stage 1 and
                      are not found again by this run are removed from the
                      campaign. Leads that moved past stage 1 are kept. Nothing
                      is removed if the run has any failures.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => onRun(true)}
                      variant="destructive"
                    >
                      Replace and scrape
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
                    {
                      {
                        queued: "Queued",
                        running: "Running",
                        completed: "Completed",
                        failed: "Failed",
                      }[scrapeRun.status]
                    }
                  </Badge>
                  {scrapeRun.summary && (
                    <span className="text-sm text-muted-foreground">
                      {`${formatNumber(scrapeRun.summary.discovered)} found · ${formatNumber(
                        scrapeRun.summary.communitiesCreated,
                      )} new communities · ${formatNumber(scrapeRun.summary.leadsAttached)} leads added · ${formatNumber(
                        scrapeRun.summary.leadsRemoved ?? 0,
                      )} removed · ${formatNumber(
                        scrapeRun.summary.filteredOut ?? 0,
                      )} filtered out · ${formatNumber(scrapeRun.summary.failures.length)} failed`}
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

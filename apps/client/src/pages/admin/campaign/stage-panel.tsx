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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@repo/ui/components/ui/tooltip";
import { Link } from "@tanstack/react-router";
import {
  ListChecksIcon,
  MailSearchIcon,
  PlayIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
  SparklesIcon,
} from "lucide-react";

const FIRST_STAGE = 1;
const FILTER_STAGE = 2;
const ENRICH_STAGE = 3;
const FIND_EMAIL_STAGE = 4;

interface StagePanelProps {
  campaignId: number;
  canRun: boolean;
  isEnriching: boolean;
  isFindingEmail: boolean;
  isFiltering: boolean;
  isReapplying: boolean;
  onReapplyFilter: () => void;
  onRunEnrich: () => void;
  onRunFindEmail: () => void;
  onRunFilter: () => void;
  isRunning: boolean;
  onRun: (replace: boolean) => void;
  scrapeRun?: ScrapeRun;
  stage: StageCount;
}

export const StagePanel = ({
  campaignId,
  canRun,
  isEnriching,
  isFindingEmail,
  isFiltering,
  isReapplying,
  onReapplyFilter,
  onRunEnrich,
  onRunFindEmail,
  onRunFilter,
  isRunning,
  onRun,
  scrapeRun,
  stage,
}: StagePanelProps) => {
  const canStart = stage.stage === FIRST_STAGE;
  const isFilterStage = stage.stage === FILTER_STAGE;
  const isEnrichStage = stage.stage === ENRICH_STAGE;
  const isFindEmailStage = stage.stage === FIND_EMAIL_STAGE;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{`Stage ${stage.stage}`}</CardTitle>
        <CardDescription>
          {(canStart || isFilterStage || isEnrichStage || isFindEmailStage) &&
          !canRun
            ? "Activate the campaign to run its stages."
            : isFilterStage
              ? "The AI answers your questions about every lead that finished stage 1."
              : isEnrichStage
                ? "Finds a LinkedIn profile, or else a website, for qualified leads that have neither."
                : isFindEmailStage
                  ? "Finds a work email on FullEnrich for leads that have a LinkedIn profile or a website."
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
          {isFilterStage && (
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={!canRun || isFiltering} onClick={onRunFilter}>
                {isFiltering ? <Spinner /> : <SparklesIcon />}
                Run AI filter
              </Button>
              <Button
                disabled={isFiltering || isReapplying}
                onClick={onReapplyFilter}
                variant="outline"
              >
                {isReapplying ? <Spinner /> : <ListChecksIcon />}
                Re-apply rules
              </Button>
              <Button
                render={
                  <Link
                    params={{ campaignId }}
                    to="/admin/campaigns/$campaignId/filter"
                  />
                }
                variant="outline"
              >
                <SettingsIcon />
                AI filter settings
              </Button>
            </div>
          )}
          {isEnrichStage && (
            <div className="flex flex-wrap items-center gap-3">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span className="inline-flex">
                        <Button
                          disabled={!canRun || isEnriching}
                          onClick={onRunEnrich}
                        >
                          {isEnriching ? <Spinner /> : <SearchIcon />}
                          Run web search
                        </Button>
                      </span>
                    }
                  />
                  <TooltipContent>
                    {canRun
                      ? "Search Tavily for a LinkedIn profile or website for each qualified lead that has neither"
                      : "Activate the campaign to run the web search"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
          {isFindEmailStage && (
            <div className="flex flex-wrap items-center gap-3">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span className="inline-flex">
                        <Button
                          disabled={!canRun || isFindingEmail}
                          onClick={onRunFindEmail}
                        >
                          {isFindingEmail ? <Spinner /> : <MailSearchIcon />}
                          Find emails
                        </Button>
                      </span>
                    }
                  />
                  <TooltipContent>
                    {canRun
                      ? "Ask FullEnrich for a work email for each lead that has a LinkedIn profile or a website"
                      : "Activate the campaign to find emails"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
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

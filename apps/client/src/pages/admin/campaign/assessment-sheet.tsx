import type { LeadAssessment } from "@/api/campaign";
import { Badge } from "@repo/ui/components/ui/badge";
import { ScrollArea } from "@repo/ui/components/ui/scroll-area";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/ui/sheet";
import { VerdictBadge } from "./verdict-badge";

interface AssessmentSheetProps {
  assessment?: LeadAssessment;
  isError: boolean;
  isOpen: boolean;
  isPending: boolean;
  leadName?: string;
  onClose: () => void;
}

const answerLabels = { yes: "Yes", no: "No", unknown: "Unknown" } as const;

const countSignals = (assessment?: LeadAssessment) => {
  const signals =
    assessment?.answers.filter((answer) => answer.role === "signal") ?? [];

  return {
    yes: signals.filter((answer) => answer.answer === "yes").length,
    total: signals.length,
  };
};

export const AssessmentSheet = ({
  assessment,
  isError,
  isOpen,
  isPending,
  leadName,
  onClose,
}: AssessmentSheetProps) => {
  const signals = countSignals(assessment);

  return (
    <Sheet onOpenChange={(open) => !open && onClose()} open={isOpen}>
      <SheetContent size="wide">
        <SheetHeader>
          <SheetTitle>{leadName ?? "AI assessment"}</SheetTitle>
          <SheetDescription>
            What the AI answered about this lead, and the words from the lead's
            own data that back each yes.
          </SheetDescription>
          {assessment && (
            <div className="flex items-center gap-2">
              <VerdictBadge verdict={assessment.verdict} />
              {signals.total > 0 && (
                <Badge variant="secondary">
                  {`Priority ${signals.yes}/${signals.total}`}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {assessment.model}
              </span>
            </div>
          )}
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 px-4 pb-6">
            {isError ? (
              <p className="text-sm text-destructive">
                This lead has not been assessed.
              </p>
            ) : isPending || !assessment ? (
              <>
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-40 w-full" />
              </>
            ) : (
              <>
                <p className="text-sm">{assessment.summary}</p>
                <ul className="space-y-4">
                  {assessment.answers.map((answer) => (
                    <li className="space-y-1 text-sm" key={answer.questionId}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{answer.label}</span>
                        <Badge
                          variant={
                            answer.answer === "yes" ? "default" : "outline"
                          }
                        >
                          {answerLabels[answer.answer]}
                        </Badge>
                      </div>
                      {answer.evidence && (
                        <blockquote className="border-l-2 pl-3 text-muted-foreground">
                          {answer.evidence}
                        </blockquote>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

import type { AssessmentVerdict } from "@repo/constants/filter";
import { Badge } from "@repo/ui/components/ui/badge";

const variants = {
  qualified: "default",
  needs_review: "secondary",
  disqualified: "outline",
  competitor: "destructive",
} as const satisfies Record<
  AssessmentVerdict,
  "default" | "secondary" | "outline" | "destructive"
>;

const verdictLabels = {
  qualified: "Qualified",
  needs_review: "Needs review",
  disqualified: "Disqualified",
  competitor: "Competitor",
} as const satisfies Record<AssessmentVerdict, string>;

interface VerdictBadgeProps {
  verdict: AssessmentVerdict;
}

export const VerdictBadge = ({ verdict }: VerdictBadgeProps) => (
  <Badge variant={variants[verdict]}>{verdictLabels[verdict]}</Badge>
);

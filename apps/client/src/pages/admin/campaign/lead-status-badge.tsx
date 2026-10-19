import type { LeadStatus } from "@/lib/campaign";
import { leadStatusLabels } from "@/lib/campaign";
import { Badge } from "@repo/ui/components/ui/badge";

const variants = {
  pending: "outline",
  running: "secondary",
  done: "default",
  failed: "destructive",
} as const satisfies Record<
  LeadStatus,
  "outline" | "secondary" | "default" | "destructive"
>;

interface LeadStatusBadgeProps {
  status: LeadStatus;
}

export const LeadStatusBadge = ({ status }: LeadStatusBadgeProps) => {
  return <Badge variant={variants[status]}>{leadStatusLabels[status]}</Badge>;
};

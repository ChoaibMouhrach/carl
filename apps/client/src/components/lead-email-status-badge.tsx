import type { LeadEmailStatus } from "@repo/constants/lead-emails";
import { Badge } from "@repo/ui/components/ui/badge";
import {
  leadEmailStatusLabels,
  leadEmailStatusVariants,
} from "@/lib/lead-email";

interface LeadEmailStatusBadgeProps {
  status: LeadEmailStatus | null | undefined;
}

export const LeadEmailStatusBadge = ({ status }: LeadEmailStatusBadgeProps) => {
  if (!status) return null;

  return (
    <Badge variant={leadEmailStatusVariants[status]}>
      {leadEmailStatusLabels[status]}
    </Badge>
  );
};

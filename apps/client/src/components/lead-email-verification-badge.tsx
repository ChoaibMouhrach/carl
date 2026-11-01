import type { LeadEmailVerification } from "@repo/constants/lead-emails";
import { Badge } from "@repo/ui/components/ui/badge";
import {
  leadEmailVerificationLabels,
  leadEmailVerificationVariants,
} from "@/lib/lead-email";

interface LeadEmailVerificationBadgeProps {
  verification: LeadEmailVerification | null | undefined;
}

export const LeadEmailVerificationBadge = ({
  verification,
}: LeadEmailVerificationBadgeProps) => {
  if (!verification) return null;

  return (
    <Badge variant={leadEmailVerificationVariants[verification]}>
      {leadEmailVerificationLabels[verification]}
    </Badge>
  );
};

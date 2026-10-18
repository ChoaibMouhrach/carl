import type { LeadStatus } from "@/lib/campaign";
import { Badge } from "@repo/ui/components/ui/badge";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();

  return (
    <Badge variant={variants[status]}>
      {t(`adminCampaign.leadStatus.${status}`)}
    </Badge>
  );
};

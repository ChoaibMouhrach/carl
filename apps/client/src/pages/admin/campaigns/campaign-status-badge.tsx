import type { CampaignStatus } from "@/lib/campaign";
import { Badge } from "@repo/ui/components/ui/badge";
import { useTranslation } from "react-i18next";

const variants = {
  draft: "outline",
  active: "default",
  paused: "secondary",
  completed: "outline",
} as const satisfies Record<
  CampaignStatus,
  "outline" | "default" | "secondary"
>;

interface CampaignStatusBadgeProps {
  status: CampaignStatus;
}

export const CampaignStatusBadge = ({ status }: CampaignStatusBadgeProps) => {
  const { t } = useTranslation();

  return (
    <Badge variant={variants[status]}>
      {t(`adminCampaigns.status.${status}`)}
    </Badge>
  );
};

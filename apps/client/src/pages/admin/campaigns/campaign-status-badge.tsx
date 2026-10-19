import type { CampaignStatus } from "@/lib/campaign";
import { campaignStatusLabels } from "@/lib/campaign";
import { Badge } from "@repo/ui/components/ui/badge";

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
  return (
    <Badge variant={variants[status]}>{campaignStatusLabels[status]}</Badge>
  );
};

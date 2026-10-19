import type { CampaignDetail } from "@/api/campaign";
import { AdminPageDescription, AdminPageTitle } from "@/components/admin-page";
import { formatNumber } from "@/lib/format";
import type { CampaignStatus } from "@/lib/campaign";
import { Button } from "@repo/ui/components/ui/button";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { Link } from "@tanstack/react-router";
import { PauseIcon, PencilIcon, PlayIcon } from "lucide-react";
import { CampaignStatusBadge } from "../campaigns/campaign-status-badge";

interface CampaignHeaderProps {
  campaign: CampaignDetail;
  isStatusPending: boolean;
  onStatusChange: (status: CampaignStatus) => void;
}

export const CampaignHeader = ({
  campaign,
  isStatusPending,
  onStatusChange,
}: CampaignHeaderProps) => {
  const isActive = campaign.status === "active";
  const canToggle = campaign.status !== "completed";

  const toggleLabel = isActive
    ? "Pause"
    : campaign.status === "paused"
      ? "Resume"
      : "Activate";

  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <AdminPageTitle>{campaign.name}</AdminPageTitle>
          <CampaignStatusBadge status={campaign.status} />
        </div>
        <AdminPageDescription>
          {campaign.description ? `${campaign.description} · ` : ""}
          {`${formatNumber(campaign.leadCount)} leads`}
        </AdminPageDescription>
      </div>
      <div className="flex gap-2">
        <Button
          render={
            <Link
              params={{ campaignId: campaign.campaignId }}
              to="/admin/campaigns/$campaignId/edit"
            />
          }
          variant="outline"
        >
          <PencilIcon />
          Edit
        </Button>
        {canToggle && (
          <Button
            disabled={isStatusPending}
            onClick={() => onStatusChange(isActive ? "paused" : "active")}
          >
            {isStatusPending ? (
              <Spinner />
            ) : isActive ? (
              <PauseIcon />
            ) : (
              <PlayIcon />
            )}
            {toggleLabel}
          </Button>
        )}
      </div>
    </header>
  );
};

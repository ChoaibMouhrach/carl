import type { CampaignDetail } from "@/api/campaign";
import { AdminPageDescription, AdminPageTitle } from "@/components/admin-page";
import { formatNumber } from "@/lib/format";
import type { CampaignStatus } from "@/lib/campaign";
import { Button } from "@repo/ui/components/ui/button";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { Link } from "@tanstack/react-router";
import { PauseIcon, PencilIcon, PlayIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const isActive = campaign.status === "active";
  const canToggle = campaign.status !== "completed";

  const toggleLabel = isActive
    ? t("adminCampaign.pause")
    : campaign.status === "paused"
      ? t("adminCampaign.resume")
      : t("adminCampaign.activate");

  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <AdminPageTitle>{campaign.name}</AdminPageTitle>
          <CampaignStatusBadge status={campaign.status} />
        </div>
        <AdminPageDescription>
          {campaign.description ? `${campaign.description} · ` : ""}
          {t("adminCampaign.leadCount", {
            count: formatNumber(campaign.leadCount),
          })}
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
          {t("adminCampaign.edit")}
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

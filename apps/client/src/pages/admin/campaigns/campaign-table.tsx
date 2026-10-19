import type { CampaignSummary } from "@/api/campaign";
import { RowActions } from "@/components/row-actions";
import { formatDate, formatNumber } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { CampaignStatusBadge } from "./campaign-status-badge";
import { StageBars } from "./stage-bars";

interface CampaignTableProps {
  campaigns: CampaignSummary[];
  isMutating: boolean;
  onRemove: (campaignId: number) => void;
  removingCampaignId?: number;
}

export const CampaignTable = ({
  campaigns,
  isMutating,
  onRemove,
  removingCampaignId,
}: CampaignTableProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("adminCampaigns.campaign")}</TableHead>
          <TableHead>{t("adminCampaigns.statusFilter")}</TableHead>
          <TableHead>{t("adminCampaigns.pipeline")}</TableHead>
          <TableHead>{t("adminCampaigns.leads")}</TableHead>
          <TableHead>{t("adminCampaigns.updated")}</TableHead>
          <TableHead>
            <span className="sr-only">{t("adminCampaigns.actions")}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {campaigns.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6}>{t("adminCampaigns.empty")}</TableCell>
          </TableRow>
        ) : (
          campaigns.map((campaign) => (
            <TableRow
              className="cursor-pointer"
              key={campaign.campaignId}
              onClick={() =>
                navigate({
                  to: "/admin/campaigns/$campaignId",
                  params: { campaignId: campaign.campaignId },
                  search: { page: 1 },
                })
              }
            >
              <TableCell>
                <div className="font-medium">{campaign.name}</div>
                {campaign.description && (
                  <div className="max-w-xs truncate text-muted-foreground">
                    {campaign.description}
                  </div>
                )}
              </TableCell>
              <TableCell>
                <CampaignStatusBadge status={campaign.status} />
              </TableCell>
              <TableCell>
                <StageBars stages={campaign.stages} />
              </TableCell>
              <TableCell>{formatNumber(campaign.leadCount)}</TableCell>
              <TableCell>{formatDate(campaign.updatedAt)}</TableCell>
              <TableCell>
                <RowActions
                  cancelLabel={t("adminCampaigns.cancel")}
                  deleteDescription={t("adminCampaigns.deleteDescription")}
                  deleteLabel={t("adminCampaigns.delete")}
                  deleteTitle={t("adminCampaigns.deleteTitle")}
                  edit={
                    <Link
                      params={{ campaignId: campaign.campaignId }}
                      to="/admin/campaigns/$campaignId/edit"
                    />
                  }
                  editLabel={t("adminCampaigns.edit")}
                  isDeleting={
                    removingCampaignId === campaign.campaignId && isMutating
                  }
                  isDisabled={isMutating}
                  menuLabel={t("adminCampaigns.actions")}
                  onDelete={() => onRemove(campaign.campaignId)}
                />
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
};

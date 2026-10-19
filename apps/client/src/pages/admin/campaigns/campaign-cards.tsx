import type { CampaignSummary } from "@/api/campaign";
import { CardFacts } from "@/components/card-facts";
import { CardFrame } from "@/components/card-frame";
import { CardGrid } from "@/components/card-grid";
import { CardIdentity } from "@/components/card-identity";
import { RowActions } from "@/components/row-actions";
import { formatDate, formatNumber } from "@/lib/format";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
} from "@repo/ui/components/ui/card";
import { Separator } from "@repo/ui/components/ui/separator";
import { Link, useNavigate } from "@tanstack/react-router";
import { CalendarIcon, MegaphoneIcon, UsersIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CampaignStatusBadge } from "./campaign-status-badge";
import { StageBars } from "./stage-bars";

interface CampaignCardsProps {
  campaigns: CampaignSummary[];
  isMutating: boolean;
  onRemove: (campaignId: number) => void;
  removingCampaignId?: number;
}

export const CampaignCards = ({
  campaigns,
  isMutating,
  onRemove,
  removingCampaignId,
}: CampaignCardsProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (campaigns.length === 0) {
    return <p className="text-muted-foreground">{t("adminCampaigns.empty")}</p>;
  }

  return (
    <CardGrid>
      {campaigns.map((campaign) => (
        <CardFrame
          key={campaign.campaignId}
          onClick={() =>
            navigate({
              to: "/admin/campaigns/$campaignId",
              params: { campaignId: campaign.campaignId },
              search: { page: 1 },
            })
          }
        >
          <Card>
            <CardHeader>
              <CardIdentity
                avatar={<MegaphoneIcon className="size-4" />}
                description={campaign.description}
                title={campaign.name}
              />
              <CardAction>
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
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Separator />
                <div className="flex items-end justify-between gap-4">
                  <CampaignStatusBadge status={campaign.status} />
                  <StageBars stages={campaign.stages} />
                </div>
                <CardFacts
                  facts={[
                    {
                      icon: UsersIcon,
                      label: t("adminCampaigns.leads"),
                      value: formatNumber(campaign.leadCount),
                    },
                    {
                      icon: CalendarIcon,
                      label: t("adminCampaigns.updated"),
                      value: formatDate(campaign.updatedAt),
                    },
                  ]}
                />
              </div>
            </CardContent>
          </Card>
        </CardFrame>
      ))}
    </CardGrid>
  );
};

import type { CampaignSummary } from "@/api/campaign";
import { CardFacts } from "@/components/card-facts";
import { CardFrame } from "@/components/card-frame";
import { CardGrid } from "@/components/card-grid";
import { CardIdentity } from "@/components/card-identity";
import { SelectCheckbox } from "@/components/select-checkbox";
import type { Selection } from "@/lib/use-selection";
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
import { CampaignStatusBadge } from "./campaign-status-badge";
import { StageBars } from "./stage-bars";

interface CampaignCardsProps {
  campaigns: CampaignSummary[];
  isMutating: boolean;
  onRemove: (campaignId: number) => void;
  removingCampaignId?: number;
  selection: Selection;
}

export const CampaignCards = ({
  campaigns,
  isMutating,
  onRemove,
  removingCampaignId,
  selection,
}: CampaignCardsProps) => {
  const navigate = useNavigate();

  if (campaigns.length === 0) {
    return <p className="text-muted-foreground">No campaigns found.</p>;
  }

  return (
    <CardGrid>
      {campaigns.map((campaign) => (
        <CardFrame
          key={campaign.campaignId}
          selected={selection.isSelected(campaign.campaignId)}
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
                leading={
                  <SelectCheckbox
                    checked={selection.isSelected(campaign.campaignId)}
                    onChange={() => selection.toggle(campaign.campaignId)}
                  />
                }
                avatar={<MegaphoneIcon className="size-4" />}
                description={campaign.description}
                title={campaign.name}
              />
              <CardAction>
                <RowActions
                  cancelLabel="Cancel"
                  deleteDescription="This permanently deletes the campaign and all of its leads. This action cannot be undone."
                  deleteLabel="Delete"
                  deleteTitle="Delete this campaign?"
                  edit={
                    <Link
                      params={{ campaignId: campaign.campaignId }}
                      to="/admin/campaigns/$campaignId/edit"
                    />
                  }
                  editLabel="Edit"
                  isDeleting={
                    removingCampaignId === campaign.campaignId && isMutating
                  }
                  isDisabled={isMutating}
                  menuLabel="Actions"
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
                      label: "Leads",
                      value: formatNumber(campaign.leadCount),
                    },
                    {
                      icon: CalendarIcon,
                      label: "Updated",
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

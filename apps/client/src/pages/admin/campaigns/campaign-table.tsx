import type { CampaignSummary } from "@/api/campaign";
import { RowActions } from "@/components/row-actions";
import { SelectCheckbox } from "@/components/select-checkbox";
import type { Selection } from "@/lib/use-selection";
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
import { CampaignStatusBadge } from "./campaign-status-badge";
import { StageBars } from "./stage-bars";

interface CampaignTableProps {
  campaigns: CampaignSummary[];
  isMutating: boolean;
  onRemove: (campaignId: number) => void;
  removingCampaignId?: number;
  selection: Selection;
}

export const CampaignTable = ({
  campaigns,
  isMutating,
  onRemove,
  removingCampaignId,
  selection,
}: CampaignTableProps) => {
  const navigate = useNavigate();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <SelectCheckbox
              checked={selection.allSelected}
              indeterminate={selection.someSelected}
              label="Select all"
              onChange={selection.toggleAll}
            />
          </TableHead>
          <TableHead>Campaign</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Pipeline</TableHead>
          <TableHead>Leads</TableHead>
          <TableHead>Updated</TableHead>
          <TableHead>
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {campaigns.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7}>No campaigns found.</TableCell>
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
                <SelectCheckbox
                  checked={selection.isSelected(campaign.campaignId)}
                  onChange={() => selection.toggle(campaign.campaignId)}
                />
              </TableCell>
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
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
};

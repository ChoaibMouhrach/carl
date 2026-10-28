import { api } from "@/api";
import { RowActions } from "@/components/row-actions";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { Badge } from "@repo/ui/components/ui/badge";
import { DropdownMenuItem } from "@repo/ui/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { Link, useNavigate } from "@tanstack/react-router";
import { PauseIcon, PlayIcon } from "lucide-react";

type Campaign = Awaited<
  ReturnType<typeof api.campaign.list>
>["campaigns"][number];

interface CampaignTableProps {
  campaigns: Campaign[];
  isMutating: boolean;
  onRemove: (campaignId: number) => void;
  onToggleActive: (campaignId: number, isActive: boolean) => void;
  removingCampaignId?: number;
}

export const CampaignTable = ({
  campaigns,
  isMutating,
  onRemove,
  onToggleActive,
  removingCampaignId,
}: CampaignTableProps) => {
  const navigate = useNavigate();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Campaign</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Keyword</TableHead>
          <TableHead>Min price</TableHead>
          <TableHead>Min members</TableHead>
          <TableHead>Leads</TableHead>
          <TableHead>Communities</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="w-12">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {campaigns.map((campaign) => (
          <TableRow
            className="cursor-pointer"
            key={campaign.campaignId}
            onClick={() =>
              navigate({
                to: "/admin/campaigns/$campaignId",
                params: { campaignId: campaign.campaignId },
                search: { step: "scrape", page: 1 },
              })
            }
          >
            <TableCell>
              <div className="max-w-72 min-w-0">
                <Link
                  className="block truncate font-medium hover:underline"
                  onClick={(event) => event.stopPropagation()}
                  params={{ campaignId: campaign.campaignId }}
                  search={{ step: "scrape", page: 1 }}
                  to="/admin/campaigns/$campaignId"
                >
                  {campaign.name}
                </Link>
                <div className="truncate text-muted-foreground">
                  {campaign.description ?? "No description"}
                </div>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={campaign.isActive ? "default" : "outline"}>
                {campaign.isActive ? "Active" : "Inactive"}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge variant="outline">{campaign.keyword}</Badge>
            </TableCell>
            <TableCell>
              {!campaign.minPriceCents
                ? "Any"
                : `${formatCurrency(campaign.minPriceCents / 100, "USD")} / mo`}
            </TableCell>
            <TableCell>
              {!campaign.minMembers ? "Any" : formatNumber(campaign.minMembers)}
            </TableCell>
            <TableCell>
              <Badge
                variant={campaign.leadsCount === 0 ? "outline" : "secondary"}
              >
                {campaign.leadsCount}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge
                variant={
                  campaign.communitiesCount === 0 ? "outline" : "secondary"
                }
              >
                {campaign.communitiesCount}
              </Badge>
            </TableCell>
            <TableCell>{formatDate(campaign.createdAt)}</TableCell>
            <TableCell>
              <RowActions
                cancelLabel="Cancel"
                deleteDescription={`This permanently deletes ${campaign.name}. Its leads and communities are kept. This action cannot be undone.`}
                deleteLabel="Delete"
                deleteTitle="Delete this campaign?"
                edit={
                  <Link
                    params={{ campaignId: campaign.campaignId }}
                    to="/admin/campaigns/$campaignId/edit"
                  />
                }
                editLabel="Edit"
                extraActions={
                  <DropdownMenuItem
                    onClick={() =>
                      onToggleActive(campaign.campaignId, !campaign.isActive)
                    }
                  >
                    {campaign.isActive ? <PauseIcon /> : <PlayIcon />}
                    {campaign.isActive ? "Deactivate" : "Activate"}
                  </DropdownMenuItem>
                }
                isDeleting={
                  removingCampaignId === campaign.campaignId && isMutating
                }
                isDisabled={isMutating}
                menuLabel="Campaign actions"
                onDelete={() => onRemove(campaign.campaignId)}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

import { api } from "@/api";
import { RemoveFromCampaignButton } from "@/components/remove-from-campaign-button";
import { SelectCheckbox } from "@/components/select-checkbox";
import { SelectionBar } from "@/components/selection-bar";
import { Tip } from "@/components/tip";
import { formatNumber } from "@/lib/format";
import type { Selection } from "@/lib/use-selection";
import { Button } from "@repo/ui/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { Link, useNavigate } from "@tanstack/react-router";
import { Building2Icon } from "lucide-react";
import { CommunityPrice } from "../communities/community-price";

type Community = Awaited<
  ReturnType<typeof api.community.list>
>["communities"][number];

interface CampaignCommunitiesProps {
  communities: Community[];
  isRemoving: boolean;
  onRemove: (communityIds: number[]) => void;
  selection: Selection;
}

export const CampaignCommunities = ({
  communities,
  isRemoving,
  onRemove,
  selection,
}: CampaignCommunitiesProps) => {
  const navigate = useNavigate();

  if (communities.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Building2Icon />
          </EmptyMedia>
          <EmptyTitle>No communities in this campaign</EmptyTitle>
          <EmptyDescription>
            Select communities on the Communities page and use “Add to
            campaign”.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Tip
            label="Pick the communities to add"
            render={
              <Button
                render={<Link search={{ page: 1 }} to="/admin/communities" />}
                variant="outline"
              />
            }
          >
            Browse communities
          </Tip>
        </EmptyContent>
      </Empty>
    );
  }

  const subject =
    selection.count === 1 ? "1 community" : `${selection.count} communities`;

  return (
    <div className="space-y-4">
      <SelectionBar
        actions={
          <RemoveFromCampaignButton
            isPending={isRemoving}
            onConfirm={() => onRemove(selection.ids)}
            subject={subject}
          />
        }
        disabled={isRemoving}
        selection={selection}
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <SelectCheckbox
                checked={selection.allSelected}
                disabled={isRemoving}
                indeterminate={selection.someSelected}
                label="Select all communities on this page"
                onChange={selection.toggleAll}
              />
            </TableHead>
            <TableHead>Community</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Members</TableHead>
            <TableHead>Price</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {communities.map((community) => (
            <TableRow
              className="cursor-pointer"
              key={community.communityId}
              onClick={() =>
                navigate({
                  to: "/admin/communities/$communityId",
                  params: { communityId: community.communityId },
                })
              }
            >
              <TableCell>
                <SelectCheckbox
                  checked={selection.isSelected(community.communityId)}
                  disabled={isRemoving}
                  label={`Select ${community.name}`}
                  onChange={() => selection.toggle(community.communityId)}
                />
              </TableCell>
              <TableCell>
                <Link
                  className="block max-w-64 truncate font-medium hover:underline"
                  onClick={(event) => event.stopPropagation()}
                  params={{ communityId: community.communityId }}
                  to="/admin/communities/$communityId"
                >
                  {community.name}
                </Link>
              </TableCell>
              <TableCell>
                <Link
                  className="hover:underline"
                  onClick={(event) => event.stopPropagation()}
                  params={{ leadId: community.lead.leadId }}
                  to="/admin/leads/$leadId"
                >
                  {community.lead.name}
                </Link>
              </TableCell>
              <TableCell>
                {community.members === null
                  ? "—"
                  : formatNumber(community.members)}
              </TableCell>
              <TableCell>
                <CommunityPrice community={community} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

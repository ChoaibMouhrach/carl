import { RowActions } from "@/components/row-actions";
import { SelectCheckbox } from "@/components/select-checkbox";
import type { Selection } from "@/lib/use-selection";
import { formatCurrency, formatNumber } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { Link } from "@tanstack/react-router";
import { type CommunityFormSource } from "./community-form";
import { CommunityPrice } from "./community-price";

interface CommunityRow extends CommunityFormSource {
  communityId: number;
  leadId: number;
  leadName?: string;
  estMonthlyRevenue: number | null;
}

export interface CommunityTableProps {
  communities: CommunityRow[];
  isMutating: boolean;
  onRemove: (communityId: number) => void;
  removingCommunityId?: number;
  selection: Selection;
  showLead: boolean;
}

export const CommunityTable = ({
  communities,
  isMutating,
  onRemove,
  removingCommunityId,
  selection,
  showLead,
}: CommunityTableProps) => {
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
          <TableHead>Community</TableHead>
          <TableHead>Members</TableHead>
          <TableHead>Price</TableHead>
          <TableHead>Est. revenue</TableHead>
          <TableHead>
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {communities.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6}>No communities found.</TableCell>
          </TableRow>
        ) : (
          communities.map((community) => (
            <TableRow key={community.communityId}>
              <TableCell>
                <SelectCheckbox
                  checked={selection.isSelected(community.communityId)}
                  onChange={() => selection.toggle(community.communityId)}
                />
              </TableCell>
              <TableCell>
                <a
                  className="font-medium hover:underline"
                  href={community.communityUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {community.displayName}
                </a>
                {showLead && community.leadName && (
                  <div>
                    <Link
                      className="text-muted-foreground hover:underline"
                      params={{ leadId: community.leadId }}
                      to="/admin/leads/$leadId"
                    >
                      {community.leadName}
                    </Link>
                  </div>
                )}
              </TableCell>
              <TableCell>{formatNumber(community.memberCount)}</TableCell>
              <TableCell>
                <CommunityPrice community={community} />
              </TableCell>
              <TableCell>
                {community.estMonthlyRevenue === null
                  ? "—"
                  : formatCurrency(community.estMonthlyRevenue, "USD")}
              </TableCell>
              <TableCell>
                <RowActions
                  cancelLabel="Cancel"
                  deleteDescription="This permanently deletes the community. This action cannot be undone."
                  deleteLabel="Delete"
                  deleteTitle="Delete this community?"
                  edit={
                    <Link
                      params={{ communityId: community.communityId }}
                      to="/admin/communities/$communityId/edit"
                    />
                  }
                  editLabel="Edit"
                  isDeleting={
                    removingCommunityId === community.communityId && isMutating
                  }
                  isDisabled={isMutating}
                  menuLabel="Actions"
                  onDelete={() => onRemove(community.communityId)}
                />
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
};

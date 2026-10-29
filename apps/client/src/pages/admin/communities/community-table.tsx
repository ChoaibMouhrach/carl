import { useEntitySheet } from "@/components/entity-sheet/use-entity-sheet";
import { EmailLink } from "@/components/external-link";
import { PictureAvatar } from "@/components/picture-avatar";
import { RowActions } from "@/components/row-actions";
import { SelectCheckbox } from "@/components/select-checkbox";
import { Tip } from "@/components/tip";
import { formatCurrency, formatNumber } from "@/lib/format";
import { Button } from "@repo/ui/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { Link } from "@tanstack/react-router";
import { ExternalLinkIcon } from "lucide-react";
import { CommunityPrice } from "./community-price";
import type { CommunityListProps } from "./community-row";

export const CommunityTable = ({
  communities,
  isMutating,
  onRemove,
  removingCommunityId,
  selection,
  showLead,
}: CommunityListProps) => {
  const { openCommunity, openLead } = useEntitySheet();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <SelectCheckbox
              checked={selection.allSelected}
              disabled={isMutating}
              indeterminate={selection.someSelected}
              label="Select all communities on this page"
              onChange={selection.toggleAll}
            />
          </TableHead>
          <TableHead>Community</TableHead>
          <TableHead>Members</TableHead>
          <TableHead>Price</TableHead>
          <TableHead>MRR</TableHead>
          <TableHead>Email</TableHead>
          <TableHead className="w-24">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {communities.map((community) => (
          <TableRow
            className="cursor-pointer"
            key={community.communityId}
            onClick={() => openCommunity(community.communityId)}
          >
            <TableCell onClick={(event) => event.stopPropagation()}>
              <SelectCheckbox
                checked={selection.isSelected(community.communityId)}
                disabled={isMutating}
                label={`Select ${community.name}`}
                onChange={() => selection.toggle(community.communityId)}
              />
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-3">
                <PictureAvatar
                  name={community.name}
                  src={community.logoUrl ?? community.thumbnailUrl}
                />
                <div className="min-w-0">
                  <button
                    className="block max-w-64 cursor-pointer truncate text-left font-medium hover:underline"
                    onClick={(event) => {
                      event.stopPropagation();
                      openCommunity(community.communityId);
                    }}
                    type="button"
                  >
                    {community.name}
                  </button>
                  {showLead && community.lead && (
                    <button
                      className="block max-w-64 cursor-pointer truncate text-left text-muted-foreground hover:underline"
                      onClick={(event) => {
                        event.stopPropagation();
                        openLead(community.lead!.leadId);
                      }}
                      type="button"
                    >
                      {community.lead.name}
                    </button>
                  )}
                </div>
              </div>
            </TableCell>
            <TableCell>
              {community.members === null
                ? "—"
                : formatNumber(community.members)}
            </TableCell>
            <TableCell>
              <CommunityPrice community={community} />
            </TableCell>
            <TableCell>
              {community.mrr === null
                ? "—"
                : formatCurrency(community.mrr, "USD")}
            </TableCell>
            <TableCell>
              <EmailLink email={community.email ?? undefined} />
            </TableCell>
            <TableCell>
              <div className="flex items-center justify-end gap-1">
                <Tip
                  label="Open on Skool in a new tab"
                  render={
                    <Button
                      aria-label="Open on Skool"
                      onClick={(event) => event.stopPropagation()}
                      render={
                        <a
                          href={community.skoolUrl}
                          rel="noreferrer"
                          target="_blank"
                        />
                      }
                      size="icon"
                      variant="ghost"
                    />
                  }
                >
                  <ExternalLinkIcon />
                </Tip>
                <RowActions
                  cancelLabel="Cancel"
                  deleteDescription={`This permanently deletes ${community.name}. This action cannot be undone.`}
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
                  menuLabel="Community actions"
                  onDelete={() => onRemove(community.communityId)}
                />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

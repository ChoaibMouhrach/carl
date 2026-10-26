import { api } from "@/api";
import { EmailLink } from "@/components/external-link";
import { PictureAvatar } from "@/components/picture-avatar";
import { RowActions } from "@/components/row-actions";
import { SelectCheckbox } from "@/components/select-checkbox";
import type { Selection } from "@/lib/use-selection";
import { formatDate } from "@/lib/format";
import { Badge } from "@repo/ui/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { Link, useNavigate } from "@tanstack/react-router";

type Lead = Awaited<ReturnType<typeof api.lead.list>>["leads"][number];

interface LeadTableProps {
  isMutating: boolean;
  leads: Lead[];
  onRemove: (leadId: number) => void;
  removingLeadId?: number;
  selection: Selection;
}

export const LeadTable = ({
  isMutating,
  leads,
  onRemove,
  removingLeadId,
  selection,
}: LeadTableProps) => {
  const navigate = useNavigate();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <SelectCheckbox
              checked={selection.allSelected}
              disabled={isMutating}
              indeterminate={selection.someSelected}
              label="Select all leads on this page"
              onChange={selection.toggleAll}
            />
          </TableHead>
          <TableHead>Lead</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Communities</TableHead>
          <TableHead>Added</TableHead>
          <TableHead className="w-12">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.map((lead) => (
          <TableRow
            className="cursor-pointer"
            key={lead.leadId}
            onClick={() =>
              navigate({
                to: "/admin/leads/$leadId",
                params: { leadId: lead.leadId },
              })
            }
          >
            <TableCell onClick={(event) => event.stopPropagation()}>
              <SelectCheckbox
                checked={selection.isSelected(lead.leadId)}
                disabled={isMutating}
                label={`Select ${lead.name}`}
                onChange={() => selection.toggle(lead.leadId)}
              />
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-3">
                <PictureAvatar name={lead.name} src={lead.pictureUrl} />
                <div className="min-w-0">
                  <Link
                    className="block truncate font-medium hover:underline"
                    onClick={(event) => event.stopPropagation()}
                    params={{ leadId: lead.leadId }}
                    to="/admin/leads/$leadId"
                  >
                    {lead.name}
                  </Link>
                  <div className="truncate text-muted-foreground">
                    @{lead.username}
                  </div>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <EmailLink email={lead.email ?? undefined} />
            </TableCell>
            <TableCell>
              <Badge
                variant={lead.communitiesCount === 0 ? "outline" : "secondary"}
              >
                {lead.communitiesCount}
              </Badge>
            </TableCell>
            <TableCell>{formatDate(lead.createdAt)}</TableCell>
            <TableCell>
              <RowActions
                cancelLabel="Cancel"
                deleteDescription={`This permanently deletes ${lead.name} and ${
                  lead.communitiesCount === 0
                    ? "their details"
                    : `their ${lead.communitiesCount} ${lead.communitiesCount === 1 ? "community" : "communities"}`
                }. This action cannot be undone.`}
                deleteLabel="Delete"
                deleteTitle="Delete this lead?"
                edit={
                  <Link
                    params={{ leadId: lead.leadId }}
                    to="/admin/leads/$leadId/edit"
                  />
                }
                editLabel="Edit"
                isDeleting={removingLeadId === lead.leadId && isMutating}
                isDisabled={isMutating}
                menuLabel="Lead actions"
                onDelete={() => onRemove(lead.leadId)}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

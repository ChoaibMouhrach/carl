import { api } from "@/api";
import { RowActions } from "@/components/row-actions";
import { SelectCheckbox } from "@/components/select-checkbox";
import type { Selection } from "@/lib/use-selection";
import { formatDate } from "@/lib/format";
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
              indeterminate={selection.someSelected}
              label="Select all"
              onChange={selection.toggleAll}
            />
          </TableHead>
          <TableHead>Lead</TableHead>
          <TableHead>Website</TableHead>
          <TableHead>Communities</TableHead>
          <TableHead>Added</TableHead>
          <TableHead>
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6}>No leads found.</TableCell>
          </TableRow>
        ) : (
          leads.map((lead) => (
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
              <TableCell>
                <SelectCheckbox
                  checked={selection.isSelected(lead.leadId)}
                  onChange={() => selection.toggle(lead.leadId)}
                />
              </TableCell>
              <TableCell>
                <div className="font-medium">{lead.name}</div>
                <div className="text-muted-foreground">
                  @{lead.skoolUsername}
                </div>
              </TableCell>
              <TableCell>
                {lead.website ? (
                  <a
                    className="block max-w-64 truncate hover:underline"
                    href={lead.website}
                    onClick={(event) => event.stopPropagation()}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {lead.website}
                  </a>
                ) : (
                  <span className="text-muted-foreground">None</span>
                )}
              </TableCell>
              <TableCell>{lead.communityCount}</TableCell>
              <TableCell>{formatDate(lead.createdAt)}</TableCell>
              <TableCell>
                <RowActions
                  cancelLabel="Cancel"
                  deleteDescription="This permanently deletes the lead and all of their communities. This action cannot be undone."
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
                  menuLabel="Actions"
                  onDelete={() => onRemove(lead.leadId)}
                />
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
};

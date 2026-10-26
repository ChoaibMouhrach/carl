import { api } from "@/api";
import { EmailLink } from "@/components/external-link";
import { PictureAvatar } from "@/components/picture-avatar";
import { RemoveFromCampaignButton } from "@/components/remove-from-campaign-button";
import { SelectCheckbox } from "@/components/select-checkbox";
import { SelectionBar } from "@/components/selection-bar";
import { Tip } from "@/components/tip";
import type { Selection } from "@/lib/use-selection";
import { Badge } from "@repo/ui/components/ui/badge";
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
import { UsersIcon } from "lucide-react";

type Lead = Awaited<ReturnType<typeof api.lead.list>>["leads"][number];

interface CampaignLeadsProps {
  isRemoving: boolean;
  leads: Lead[];
  onRemove: (leadIds: number[]) => void;
  selection: Selection;
}

export const CampaignLeads = ({
  isRemoving,
  leads,
  onRemove,
  selection,
}: CampaignLeadsProps) => {
  const navigate = useNavigate();

  if (leads.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UsersIcon />
          </EmptyMedia>
          <EmptyTitle>No leads in this campaign</EmptyTitle>
          <EmptyDescription>
            Select leads on the Leads page and use “Add to campaign”.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Tip
            label="Pick the leads to add"
            render={
              <Button
                render={<Link search={{ page: 1 }} to="/admin/leads" />}
                variant="outline"
              />
            }
          >
            Browse leads
          </Tip>
        </EmptyContent>
      </Empty>
    );
  }

  const subject = selection.count === 1 ? "1 lead" : `${selection.count} leads`;

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
                label="Select all leads on this page"
                onChange={selection.toggleAll}
              />
            </TableHead>
            <TableHead>Lead</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Communities</TableHead>
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
              <TableCell>
                <SelectCheckbox
                  checked={selection.isSelected(lead.leadId)}
                  disabled={isRemoving}
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
                  variant={
                    lead.communitiesCount === 0 ? "outline" : "secondary"
                  }
                >
                  {lead.communitiesCount}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

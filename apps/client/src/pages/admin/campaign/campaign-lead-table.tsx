import type { CampaignLead } from "@/api/campaign";
import { SelectCheckbox } from "@/components/select-checkbox";
import type { Selection } from "@/lib/use-selection";
import { EmailLink, ExternalLink } from "@/components/external-link";
import { formatDate, formatNumber } from "@/lib/format";
import { Badge } from "@repo/ui/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@repo/ui/components/ui/button";
import { LeadStatusBadge } from "./lead-status-badge";
import { VerdictBadge } from "./verdict-badge";

interface CampaignLeadTableProps {
  leads: CampaignLead[];
  onOpenAssessment: (leadId: number) => void;
  selection: Selection;
  selectionLocked?: boolean;
}

export const CampaignLeadTable = ({
  leads,
  onOpenAssessment,
  selection,
  selectionLocked,
}: CampaignLeadTableProps) => {
  const navigate = useNavigate();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <SelectCheckbox
              checked={selection.allSelected}
              disabled={selectionLocked}
              indeterminate={selection.someSelected}
              label="Select all"
              onChange={selection.toggleAll}
            />
          </TableHead>
          <TableHead>Lead</TableHead>
          <TableHead>Community</TableHead>
          <TableHead>Keyword</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>LinkedIn</TableHead>
          <TableHead>Website</TableHead>
          <TableHead>Members</TableHead>
          <TableHead>Stage</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>AI verdict</TableHead>
          <TableHead>Updated</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.length === 0 ? (
          <TableRow>
            <TableCell colSpan={12}>No leads match these filters.</TableCell>
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
                  disabled={selectionLocked}
                  onChange={() => selection.toggle(lead.leadId)}
                />
              </TableCell>
              <TableCell>
                <div className="font-medium">{lead.name}</div>
                <div className="text-muted-foreground">
                  @{lead.skoolUsername}
                </div>
              </TableCell>
              <TableCell>{lead.communityName}</TableCell>
              <TableCell>{lead.keyword ?? "—"}</TableCell>
              <TableCell>
                <EmailLink email={lead.emails.at(0)} />
              </TableCell>
              <TableCell>
                <ExternalLink href={lead.linkedinUrl} />
              </TableCell>
              <TableCell>
                <ExternalLink href={lead.website} />
              </TableCell>
              <TableCell>{formatNumber(lead.memberCount)}</TableCell>
              <TableCell>
                <Badge variant="outline">{`Stage ${lead.stage}`}</Badge>
              </TableCell>
              <TableCell>
                <LeadStatusBadge status={lead.status} />
              </TableCell>
              <TableCell onClick={(event) => event.stopPropagation()}>
                {lead.verdict ? (
                  <Button
                    onClick={() => onOpenAssessment(lead.leadId)}
                    size="sm"
                    variant="ghost"
                  >
                    <VerdictBadge verdict={lead.verdict} />
                  </Button>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell>{formatDate(lead.updatedAt)}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
};

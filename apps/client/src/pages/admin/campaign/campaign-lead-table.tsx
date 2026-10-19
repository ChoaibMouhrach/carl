import type { CampaignLead } from "@/api/campaign";
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
import { useTranslation } from "react-i18next";
import { LeadStatusBadge } from "./lead-status-badge";

interface CampaignLeadTableProps {
  leads: CampaignLead[];
}

export const CampaignLeadTable = ({ leads }: CampaignLeadTableProps) => {
  const { t } = useTranslation();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("adminCampaign.lead")}</TableHead>
          <TableHead>{t("adminCampaign.community")}</TableHead>
          <TableHead>{t("adminCampaign.email")}</TableHead>
          <TableHead>{t("adminCampaign.members")}</TableHead>
          <TableHead>{t("adminCampaign.stageColumn")}</TableHead>
          <TableHead>{t("adminCampaign.statusColumn")}</TableHead>
          <TableHead>{t("adminCampaign.updatedColumn")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7}>{t("adminCampaign.emptyLeads")}</TableCell>
          </TableRow>
        ) : (
          leads.map((lead) => (
            <TableRow key={lead.leadId}>
              <TableCell>
                <div className="font-medium">{lead.name}</div>
                <div className="text-muted-foreground">
                  @{lead.skoolUsername}
                </div>
              </TableCell>
              <TableCell>{lead.communityName}</TableCell>
              <TableCell>{lead.emails.at(0) ?? "—"}</TableCell>
              <TableCell>{formatNumber(lead.memberCount)}</TableCell>
              <TableCell>
                <Badge variant="outline">
                  {t("adminCampaign.stage", { number: lead.stage })}
                </Badge>
              </TableCell>
              <TableCell>
                <LeadStatusBadge status={lead.status} />
              </TableCell>
              <TableCell>{formatDate(lead.updatedAt)}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
};

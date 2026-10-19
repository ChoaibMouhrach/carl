import { api } from "@/api";
import { RowActions } from "@/components/row-actions";
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
import { useTranslation } from "react-i18next";

type Lead = Awaited<ReturnType<typeof api.lead.list>>["leads"][number];

interface LeadTableProps {
  isMutating: boolean;
  leads: Lead[];
  onRemove: (leadId: number) => void;
  removingLeadId?: number;
}

export const LeadTable = ({
  isMutating,
  leads,
  onRemove,
  removingLeadId,
}: LeadTableProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("adminLeads.lead")}</TableHead>
          <TableHead>{t("adminLeads.website")}</TableHead>
          <TableHead>{t("adminLeads.communities")}</TableHead>
          <TableHead>{t("adminLeads.added")}</TableHead>
          <TableHead>
            <span className="sr-only">{t("adminLeads.actions")}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5}>{t("adminLeads.empty")}</TableCell>
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
                  <span className="text-muted-foreground">
                    {t("adminLeads.noWebsite")}
                  </span>
                )}
              </TableCell>
              <TableCell>{lead.communityCount}</TableCell>
              <TableCell>{formatDate(lead.createdAt)}</TableCell>
              <TableCell>
                <RowActions
                  cancelLabel={t("adminLeads.cancel")}
                  deleteDescription={t("adminLeads.deleteDescription")}
                  deleteLabel={t("adminLeads.delete")}
                  deleteTitle={t("adminLeads.deleteTitle")}
                  edit={
                    <Link
                      params={{ leadId: lead.leadId }}
                      to="/admin/leads/$leadId/edit"
                    />
                  }
                  editLabel={t("adminLeads.edit")}
                  isDeleting={removingLeadId === lead.leadId && isMutating}
                  isDisabled={isMutating}
                  menuLabel={t("adminLeads.actions")}
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

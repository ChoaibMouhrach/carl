import { api } from "@/api";
import { CardFacts } from "@/components/card-facts";
import { CardFrame } from "@/components/card-frame";
import { CardGrid } from "@/components/card-grid";
import { CardIdentity } from "@/components/card-identity";
import { initialsOf } from "@/lib/initials";
import { RowActions } from "@/components/row-actions";
import { formatDate } from "@/lib/format";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
} from "@repo/ui/components/ui/card";
import { Separator } from "@repo/ui/components/ui/separator";
import { Link, useNavigate } from "@tanstack/react-router";
import { Building2Icon, CalendarIcon, GlobeIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

type Lead = Awaited<ReturnType<typeof api.lead.list>>["leads"][number];

interface LeadCardsProps {
  isMutating: boolean;
  leads: Lead[];
  onRemove: (leadId: number) => void;
  removingLeadId?: number;
}

export const LeadCards = ({
  isMutating,
  leads,
  onRemove,
  removingLeadId,
}: LeadCardsProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (leads.length === 0) {
    return <p className="text-muted-foreground">{t("adminLeads.empty")}</p>;
  }

  return (
    <CardGrid>
      {leads.map((lead) => (
        <CardFrame
          key={lead.leadId}
          onClick={() =>
            navigate({
              to: "/admin/leads/$leadId",
              params: { leadId: lead.leadId },
            })
          }
        >
          <Card>
            <CardHeader>
              <CardIdentity
                avatar={initialsOf(lead.name)}
                description={`@${lead.skoolUsername}`}
                title={lead.name}
              />
              <CardAction>
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
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Separator />
                <CardFacts
                  facts={[
                    {
                      icon: GlobeIcon,
                      label: t("adminLeads.website"),
                      value: lead.website ? (
                        <a
                          className="hover:underline"
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
                      ),
                    },
                    {
                      icon: Building2Icon,
                      label: t("adminLeads.communities"),
                      value: lead.communityCount,
                    },
                    {
                      icon: CalendarIcon,
                      label: t("adminLeads.added"),
                      value: formatDate(lead.createdAt),
                    },
                  ]}
                />
              </div>
            </CardContent>
          </Card>
        </CardFrame>
      ))}
    </CardGrid>
  );
};

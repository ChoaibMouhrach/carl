import type { CampaignLead } from "@/api/campaign";
import { CardFacts } from "@/components/card-facts";
import { CardFrame } from "@/components/card-frame";
import { CardGrid } from "@/components/card-grid";
import { CardIdentity } from "@/components/card-identity";
import { SelectCheckbox } from "@/components/select-checkbox";
import type { Selection } from "@/lib/use-selection";
import { initialsOf } from "@/lib/initials";
import { EmailLink, ExternalLink } from "@/components/external-link";
import { formatDate, formatNumber } from "@/lib/format";
import { Badge } from "@repo/ui/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
} from "@repo/ui/components/ui/card";
import { Separator } from "@repo/ui/components/ui/separator";
import {
  Building2Icon,
  CalendarIcon,
  GlobeIcon,
  LinkIcon,
  MailIcon,
  SearchIcon,
  UsersIcon,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { LeadStatusBadge } from "./lead-status-badge";

interface CampaignLeadCardsProps {
  leads: CampaignLead[];
  selection: Selection;
}

export const CampaignLeadCards = ({
  leads,
  selection,
}: CampaignLeadCardsProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (leads.length === 0) {
    return (
      <p className="text-muted-foreground">{t("adminCampaign.emptyLeads")}</p>
    );
  }

  return (
    <CardGrid>
      {leads.map((lead) => (
        <CardFrame
          key={lead.leadId}
          selected={selection.isSelected(lead.leadId)}
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
                leading={
                  <SelectCheckbox
                    checked={selection.isSelected(lead.leadId)}
                    onChange={() => selection.toggle(lead.leadId)}
                  />
                }
                avatar={initialsOf(lead.name)}
                description={`@${lead.skoolUsername}`}
                title={lead.name}
              />
              <CardAction>
                <LeadStatusBadge status={lead.status} />
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Separator />
                <div>
                  <Badge variant="outline">
                    {t("adminCampaign.stage", { number: lead.stage })}
                  </Badge>
                </div>
                <CardFacts
                  facts={[
                    {
                      icon: Building2Icon,
                      label: t("adminCampaign.community"),
                      value: lead.communityName,
                    },
                    {
                      icon: SearchIcon,
                      label: t("adminCampaign.keyword"),
                      value: lead.keyword ?? "—",
                    },
                    {
                      icon: UsersIcon,
                      label: t("adminCampaign.members"),
                      value: formatNumber(lead.memberCount),
                    },
                    {
                      icon: MailIcon,
                      label: t("adminCampaign.email"),
                      value: <EmailLink email={lead.emails.at(0)} />,
                    },
                    {
                      icon: LinkIcon,
                      label: t("adminCampaign.linkedin"),
                      value: <ExternalLink href={lead.linkedinUrl} />,
                    },
                    {
                      icon: GlobeIcon,
                      label: t("adminCampaign.website"),
                      value: <ExternalLink href={lead.website} />,
                    },
                    {
                      icon: CalendarIcon,
                      label: t("adminCampaign.updatedColumn"),
                      value: formatDate(lead.updatedAt),
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

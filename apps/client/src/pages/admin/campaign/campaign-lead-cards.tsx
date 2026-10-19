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
import { LeadStatusBadge } from "./lead-status-badge";

interface CampaignLeadCardsProps {
  leads: CampaignLead[];
  selection: Selection;
  selectionLocked?: boolean;
}

export const CampaignLeadCards = ({
  leads,
  selection,
  selectionLocked,
}: CampaignLeadCardsProps) => {
  const navigate = useNavigate();

  if (leads.length === 0) {
    return (
      <p className="text-muted-foreground">No leads match these filters.</p>
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
                    disabled={selectionLocked}
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
                  <Badge variant="outline">{`Stage ${lead.stage}`}</Badge>
                </div>
                <CardFacts
                  facts={[
                    {
                      icon: Building2Icon,
                      label: "Community",
                      value: lead.communityName,
                    },
                    {
                      icon: SearchIcon,
                      label: "Keyword",
                      value: lead.keyword ?? "—",
                    },
                    {
                      icon: UsersIcon,
                      label: "Members",
                      value: formatNumber(lead.memberCount),
                    },
                    {
                      icon: MailIcon,
                      label: "Email",
                      value: <EmailLink email={lead.emails.at(0)} />,
                    },
                    {
                      icon: LinkIcon,
                      label: "LinkedIn",
                      value: <ExternalLink href={lead.linkedinUrl} />,
                    },
                    {
                      icon: GlobeIcon,
                      label: "Website",
                      value: <ExternalLink href={lead.website} />,
                    },
                    {
                      icon: CalendarIcon,
                      label: "Updated",
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

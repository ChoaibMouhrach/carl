import { api } from "@/api";
import { CardFacts } from "@/components/card-facts";
import { CardFrame } from "@/components/card-frame";
import { CardGrid } from "@/components/card-grid";
import { CardIdentity } from "@/components/card-identity";
import { EmailLink } from "@/components/external-link";
import { RowActions } from "@/components/row-actions";
import { SelectCheckbox } from "@/components/select-checkbox";
import type { Selection } from "@/lib/use-selection";
import { formatDate } from "@/lib/format";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
} from "@repo/ui/components/ui/card";
import { Separator } from "@repo/ui/components/ui/separator";
import { Link, useNavigate } from "@tanstack/react-router";
import { Building2Icon, CalendarIcon, MailIcon } from "lucide-react";

type Lead = Awaited<ReturnType<typeof api.lead.list>>["leads"][number];

interface LeadCardsProps {
  isMutating: boolean;
  leads: Lead[];
  onRemove: (leadId: number) => void;
  removingLeadId?: number;
  selection: Selection;
}

export const LeadCards = ({
  isMutating,
  leads,
  onRemove,
  removingLeadId,
  selection,
}: LeadCardsProps) => {
  const navigate = useNavigate();

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
                    disabled={isMutating}
                    label={`Select ${lead.name}`}
                    onChange={() => selection.toggle(lead.leadId)}
                  />
                }
                description={`@${lead.username}`}
                image={lead.pictureUrl}
                name={lead.name}
                title={lead.name}
              />
              <CardAction>
                <RowActions
                  cancelLabel="Cancel"
                  deleteDescription={`This permanently deletes ${lead.name} and their communities. This action cannot be undone.`}
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
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Separator />
                <CardFacts
                  facts={[
                    {
                      icon: MailIcon,
                      label: "Email",
                      value: <EmailLink email={lead.email ?? undefined} />,
                    },
                    {
                      icon: Building2Icon,
                      label: "Communities",
                      value: lead.communitiesCount,
                    },
                    {
                      icon: CalendarIcon,
                      label: "Added",
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

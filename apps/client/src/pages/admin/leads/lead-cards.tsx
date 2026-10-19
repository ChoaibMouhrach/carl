import { api } from "@/api";
import { CardFacts } from "@/components/card-facts";
import { CardFrame } from "@/components/card-frame";
import { CardGrid } from "@/components/card-grid";
import { CardIdentity } from "@/components/card-identity";
import { SelectCheckbox } from "@/components/select-checkbox";
import type { Selection } from "@/lib/use-selection";
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

  if (leads.length === 0) {
    return <p className="text-muted-foreground">No leads found.</p>;
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
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Separator />
                <CardFacts
                  facts={[
                    {
                      icon: GlobeIcon,
                      label: "Website",
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
                        <span className="text-muted-foreground">None</span>
                      ),
                    },
                    {
                      icon: Building2Icon,
                      label: "Communities",
                      value: lead.communityCount,
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

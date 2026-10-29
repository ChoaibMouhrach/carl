import { useEntitySheet } from "@/components/entity-sheet/use-entity-sheet";
import { CardFacts } from "@/components/card-facts";
import { CardFrame } from "@/components/card-frame";
import { CardGrid } from "@/components/card-grid";
import { CardIdentity } from "@/components/card-identity";
import { CoverImage } from "@/components/cover-image";
import { EmailLink } from "@/components/external-link";
import { RowActions } from "@/components/row-actions";
import { SelectCheckbox } from "@/components/select-checkbox";
import { formatCurrency, formatNumber } from "@/lib/format";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
} from "@repo/ui/components/ui/card";
import { Separator } from "@repo/ui/components/ui/separator";
import { Link } from "@tanstack/react-router";
import {
  BadgeDollarSignIcon,
  MailIcon,
  TagIcon,
  UsersIcon,
} from "lucide-react";
import { CommunityPrice } from "./community-price";
import type { CommunityListProps } from "./community-row";

export const CommunityCards = ({
  communities,
  isMutating,
  onRemove,
  removingCommunityId,
  selection,
  showLead,
}: CommunityListProps) => {
  const { openCommunity } = useEntitySheet();

  return (
    <CardGrid>
      {communities.map((community) => (
        <CardFrame
          key={community.communityId}
          selected={selection.isSelected(community.communityId)}
          onClick={() => openCommunity(community.communityId)}
        >
          <Card>
            <CardHeader>
              <CardIdentity
                leading={
                  <SelectCheckbox
                    checked={selection.isSelected(community.communityId)}
                    disabled={isMutating}
                    label={`Select ${community.name}`}
                    onChange={() => selection.toggle(community.communityId)}
                  />
                }
                description={showLead ? community.lead?.name : undefined}
                image={community.logoUrl ?? community.thumbnailUrl}
                name={community.name}
                title={community.name}
              />
              <CardAction>
                <RowActions
                  cancelLabel="Cancel"
                  deleteDescription={`This permanently deletes ${community.name}. This action cannot be undone.`}
                  deleteLabel="Delete"
                  deleteTitle="Delete this community?"
                  edit={
                    <Link
                      params={{ communityId: community.communityId }}
                      to="/admin/communities/$communityId/edit"
                    />
                  }
                  editLabel="Edit"
                  isDeleting={
                    removingCommunityId === community.communityId && isMutating
                  }
                  isDisabled={isMutating}
                  menuLabel="Community actions"
                  onDelete={() => onRemove(community.communityId)}
                />
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {community.thumbnailUrl && (
                  <CoverImage src={community.thumbnailUrl} />
                )}
                <Separator />
                <CardFacts
                  facts={[
                    {
                      icon: UsersIcon,
                      label: "Members",
                      value:
                        community.members === null
                          ? "—"
                          : formatNumber(community.members),
                    },
                    {
                      icon: TagIcon,
                      label: "Price",
                      value: <CommunityPrice community={community} />,
                    },
                    {
                      icon: BadgeDollarSignIcon,
                      label: "MRR",
                      value:
                        community.mrr === null
                          ? "—"
                          : formatCurrency(community.mrr, "USD"),
                    },
                    {
                      icon: MailIcon,
                      label: "Email",
                      value: <EmailLink email={community.email ?? undefined} />,
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

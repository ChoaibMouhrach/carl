import { CardFacts } from "@/components/card-facts";
import { CardFrame } from "@/components/card-frame";
import { CardGrid } from "@/components/card-grid";
import { CardIdentity } from "@/components/card-identity";
import { SelectCheckbox } from "@/components/select-checkbox";
import { initialsOf } from "@/lib/initials";
import { RowActions } from "@/components/row-actions";
import { formatCurrency, formatNumber } from "@/lib/format";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
} from "@repo/ui/components/ui/card";
import { Separator } from "@repo/ui/components/ui/separator";
import { Link } from "@tanstack/react-router";
import { BanknoteIcon, TagIcon, UsersIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CommunityPrice } from "./community-price";
import type { CommunityTableProps } from "./community-table";

export const CommunityCards = ({
  communities,
  isMutating,
  onRemove,
  removingCommunityId,
  selection,
  showLead,
}: CommunityTableProps) => {
  const { t } = useTranslation();

  if (communities.length === 0) {
    return (
      <p className="text-muted-foreground">{t("adminCommunities.empty")}</p>
    );
  }

  return (
    <CardGrid>
      {communities.map((community) => (
        <CardFrame
          key={community.communityId}
          selected={selection.isSelected(community.communityId)}
        >
          <Card>
            <CardHeader>
              <CardIdentity
                leading={
                  <SelectCheckbox
                    checked={selection.isSelected(community.communityId)}
                    onChange={() => selection.toggle(community.communityId)}
                  />
                }
                avatar={initialsOf(community.displayName)}
                description={
                  showLead && community.leadName ? (
                    <Link
                      className="hover:underline"
                      params={{ leadId: community.leadId }}
                      to="/admin/leads/$leadId"
                    >
                      {community.leadName}
                    </Link>
                  ) : undefined
                }
                title={
                  <a
                    className="hover:underline"
                    href={community.communityUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {community.displayName}
                  </a>
                }
              />
              <CardAction>
                <RowActions
                  cancelLabel={t("adminCommunities.cancel")}
                  deleteDescription={t("adminCommunities.deleteDescription")}
                  deleteLabel={t("adminCommunities.delete")}
                  deleteTitle={t("adminCommunities.deleteTitle")}
                  edit={
                    <Link
                      params={{ communityId: community.communityId }}
                      to="/admin/communities/$communityId/edit"
                    />
                  }
                  editLabel={t("adminCommunities.edit")}
                  isDeleting={
                    removingCommunityId === community.communityId && isMutating
                  }
                  isDisabled={isMutating}
                  menuLabel={t("adminCommunities.actions")}
                  onDelete={() => onRemove(community.communityId)}
                />
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Separator />
                <CardFacts
                  facts={[
                    {
                      icon: UsersIcon,
                      label: t("adminCommunities.members"),
                      value: formatNumber(community.memberCount),
                    },
                    {
                      icon: TagIcon,
                      label: t("adminCommunities.price"),
                      value: <CommunityPrice community={community} />,
                    },
                    {
                      icon: BanknoteIcon,
                      label: t("adminCommunities.revenue"),
                      value:
                        community.estMonthlyRevenue === null
                          ? "—"
                          : formatCurrency(community.estMonthlyRevenue, "USD"),
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

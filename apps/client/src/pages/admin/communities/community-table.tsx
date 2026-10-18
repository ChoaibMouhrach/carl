import { RowActions } from "@/components/row-actions";
import { formatCurrency, formatNumber } from "@/lib/format";
import { Badge } from "@repo/ui/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { type CommunityFormSource } from "./community-form";

interface CommunityRow extends CommunityFormSource {
  communityId: number;
  leadId: number;
  leadName?: string;
  estMonthlyRevenue: number | null;
}

interface CommunityTableProps {
  communities: CommunityRow[];
  isMutating: boolean;
  onRemove: (communityId: number) => void;
  removingCommunityId?: number;
  showLead: boolean;
}

const intervalKeys = {
  month: "adminCommunities.perMonth",
  year: "adminCommunities.perYear",
  one_time: "adminCommunities.oneTime",
} as const;

export const CommunityTable = ({
  communities,
  isMutating,
  onRemove,
  removingCommunityId,
  showLead,
}: CommunityTableProps) => {
  const { t } = useTranslation();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("adminCommunities.community")}</TableHead>
          <TableHead>{t("adminCommunities.members")}</TableHead>
          <TableHead>{t("adminCommunities.price")}</TableHead>
          <TableHead>{t("adminCommunities.revenue")}</TableHead>
          <TableHead>
            <span className="sr-only">{t("adminCommunities.actions")}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {communities.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5}>{t("adminCommunities.empty")}</TableCell>
          </TableRow>
        ) : (
          communities.map((community) => (
            <TableRow key={community.communityId}>
              <TableCell>
                <a
                  className="font-medium hover:underline"
                  href={community.communityUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {community.displayName}
                </a>
                {showLead && community.leadName && (
                  <div>
                    <Link
                      className="text-muted-foreground hover:underline"
                      params={{ leadId: community.leadId }}
                      to="/admin/leads/$leadId"
                    >
                      {community.leadName}
                    </Link>
                  </div>
                )}
              </TableCell>
              <TableCell>{formatNumber(community.memberCount)}</TableCell>
              <TableCell>
                {community.pricingType === "free" ? (
                  <Badge variant="secondary">
                    {t("adminCommunities.free")}
                  </Badge>
                ) : (
                  <>
                    {formatCurrency(
                      community.priceAmount / 100,
                      community.priceCurrency ?? "USD",
                    )}{" "}
                    {community.pricingInterval &&
                      t(intervalKeys[community.pricingInterval])}
                  </>
                )}
              </TableCell>
              <TableCell>
                {community.estMonthlyRevenue === null
                  ? "—"
                  : formatCurrency(community.estMonthlyRevenue, "USD")}
              </TableCell>
              <TableCell>
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
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
};

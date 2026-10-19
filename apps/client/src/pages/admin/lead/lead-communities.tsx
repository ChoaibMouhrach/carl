import { api } from "@/api";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Button } from "@repo/ui/components/ui/button";
import { Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SelectionBar } from "@/components/selection-bar";
import { useSelection } from "@/lib/use-selection";
import { useView } from "@/lib/view";
import { CommunityCards } from "../communities/community-cards";
import { CommunityTable } from "../communities/community-table";

type Community = Awaited<
  ReturnType<typeof api.lead.show>
>["communities"][number];

interface LeadCommunitiesProps {
  communities: Community[];
  leadId: number;
  isMutating: boolean;
  onRemove: (communityId: number) => void;
  removingCommunityId?: number;
}

export const LeadCommunities = ({
  communities,
  leadId,
  isMutating,
  onRemove,
  removingCommunityId,
}: LeadCommunitiesProps) => {
  const { t } = useTranslation();
  const { view } = useView();
  const selection = useSelection(
    communities.map((community) => community.communityId),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("adminLead.communitiesTitle")}</CardTitle>
        <CardAction>
          <Button
            render={<Link search={{ leadId }} to="/admin/communities/new" />}
          >
            <PlusIcon />
            {t("adminLead.addCommunity")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <SelectionBar selection={selection} showSelectAll={view === "cards"} />
        {view === "cards" ? (
          <CommunityCards
            communities={communities}
            isMutating={isMutating}
            onRemove={onRemove}
            removingCommunityId={removingCommunityId}
            selection={selection}
            showLead={false}
          />
        ) : (
          <CommunityTable
            communities={communities}
            isMutating={isMutating}
            onRemove={onRemove}
            removingCommunityId={removingCommunityId}
            selection={selection}
            showLead={false}
          />
        )}
      </CardContent>
    </Card>
  );
};

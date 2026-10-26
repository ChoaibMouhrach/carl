import { api } from "@/api";
import { BulkDeleteButton } from "@/components/bulk-delete-button";
import { SelectionBar } from "@/components/selection-bar";
import { Tip } from "@/components/tip";
import { ViewSwitch } from "@/components/view-switch";
import type { Selection } from "@/lib/use-selection";
import { useView } from "@/lib/view";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/ui/empty";
import { Link } from "@tanstack/react-router";
import { Building2Icon, PlusIcon } from "lucide-react";
import { CommunityCards } from "../communities/community-cards";
import { CommunityTable } from "../communities/community-table";

type Community = Awaited<
  ReturnType<typeof api.lead.show>
>["communities"][number];

interface LeadCommunitiesProps {
  communities: Community[];
  isMutating: boolean;
  isRemovingMany: boolean;
  leadId: number;
  onRemove: (communityId: number) => void;
  onRemoveMany: (communityIds: number[]) => void;
  removingCommunityId?: number;
  selection: Selection;
}

export const LeadCommunities = ({
  communities,
  isMutating,
  isRemovingMany,
  leadId,
  onRemove,
  onRemoveMany,
  removingCommunityId,
  selection,
}: LeadCommunitiesProps) => {
  const { view, setView } = useView();
  const selectedLabel =
    selection.count === 1 ? "1 community" : `${selection.count} communities`;

  const addCommunity = (
    <Tip
      label="Add a community owned by this lead"
      render={
        <Button
          render={<Link search={{ leadId }} to="/admin/communities/new" />}
        />
      }
    >
      <PlusIcon />
      Add community
    </Tip>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {communities.length === 1
            ? "1 community"
            : `${communities.length} communities`}
        </CardTitle>
        <CardAction className="flex items-center gap-2">
          <ViewSwitch onChange={setView} view={view} />
          {addCommunity}
        </CardAction>
      </CardHeader>
      <CardContent>
        {communities.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Building2Icon />
              </EmptyMedia>
              <EmptyTitle>No communities yet</EmptyTitle>
              <EmptyDescription>
                Communities this lead owns will show up here.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>{addCommunity}</EmptyContent>
          </Empty>
        ) : (
          <div className="space-y-4">
            <SelectionBar
              actions={
                <BulkDeleteButton
                  consequence={selectedLabel}
                  isPending={isRemovingMany}
                  label={`Delete ${selectedLabel}`}
                  onConfirm={() => onRemoveMany(selection.ids)}
                  title={`Delete ${selectedLabel}?`}
                />
              }
              disabled={isMutating}
              selection={selection}
              showSelectAll={view === "cards"}
            />
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
          </div>
        )}
      </CardContent>
    </Card>
  );
};

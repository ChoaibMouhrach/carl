import { api } from "@/api";
import { BulkDeleteButton } from "@/components/bulk-delete-button";
import { CardGridSkeleton } from "@/components/card-grid";
import { FilterChips, type FilterChip } from "@/components/filter-chips";
import { ListPagination } from "@/components/list-pagination";
import { SelectionBar } from "@/components/selection-bar";
import { TableSkeleton } from "@/components/table-skeleton";
import { Tip } from "@/components/tip";
import { ViewSwitch } from "@/components/view-switch";
import { onError } from "@/lib/base-api";
import { reportBulkDelete } from "@/lib/bulk-delete";
import { formatNumber } from "@/lib/format";
import { invalidateLeadData } from "@/lib/invalidate";
import { perPageForUrl, resolvePageSize } from "@/lib/page-size";
import { communitySortOptions, sortValue } from "@/lib/sort-options";
import { useSelection } from "@/lib/use-selection";
import { useView } from "@/lib/view";
import { adminCommunitiesRoute } from "@/routes/admin/communities";
import { Button } from "@repo/ui/components/ui/button";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/ui/empty";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Building2Icon, PlusIcon, SearchXIcon } from "lucide-react";
import { toast } from "sonner";
import { CommunityCards } from "./community-cards";
import { CommunityFilters } from "./community-filters";
import { CommunityTable } from "./community-table";

const rangeLabel = (name: string, min?: number, max?: number, unit = "") => {
  if (min !== undefined && max !== undefined) {
    return `${name}: ${formatNumber(min)}–${formatNumber(max)}${unit}`;
  }

  return min !== undefined
    ? `${name}: ${formatNumber(min)}+${unit}`
    : `${name}: up to ${formatNumber(max ?? 0)}${unit}`;
};

export const Communities = () => {
  const searchParams = adminCommunitiesRoute.useSearch();
  const navigate = adminCommunitiesRoute.useNavigate();
  const { view, setView } = useView();
  const queryClient = useQueryClient();

  const communities = useQuery({
    queryKey: ["admin", "communities", searchParams],
    queryFn: () => api.community.list(searchParams),
    placeholderData: (previousData) => previousData,
  });

  const owner = useQuery({
    queryKey: ["admin", "leads", searchParams.leadId],
    queryFn: () => api.lead.show({ leadId: searchParams.leadId ?? 0 }),
    enabled: searchParams.leadId !== undefined,
    placeholderData: (previousData) => previousData,
  });

  const selection = useSelection(
    communities.data?.communities.map((community) => community.communityId) ??
      [],
  );

  const removeMany = useMutation({
    mutationFn: (communityIds: number[]) =>
      api.community.removeMany({ communityIds }),
    onError,
    onSuccess: async (result) => {
      reportBulkDelete(result.deleted, {
        one: "community",
        many: "communities",
      });
      selection.clear();
      await invalidateLeadData(queryClient);
    },
  });

  const remove = useMutation({
    mutationFn: (communityId: number) => api.community.remove({ communityId }),
    onError,
    onSuccess: async () => {
      toast.success("Community deleted.");
      await invalidateLeadData(queryClient);
    },
  });

  const update = (changes: Partial<typeof searchParams>) =>
    navigate({ search: (current) => ({ ...current, page: 1, ...changes }) });

  const clearFilters = () =>
    update({
      search: undefined,
      leadId: undefined,
      isFree: undefined,
      hasEmail: undefined,
      minMembers: undefined,
      maxMembers: undefined,
      minMrr: undefined,
      maxMrr: undefined,
    });

  if (communities.isPending) {
    return (
      <Card>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-9 w-72" />
              <Skeleton className="h-9 w-36" />
              <Skeleton className="h-9 w-40" />
              <Skeleton className="h-9 w-36" />
              <Skeleton className="ml-auto h-9 w-40" />
            </div>
            <Skeleton className="h-5 w-32" />
            {view === "cards" ? (
              <CardGridSkeleton />
            ) : (
              <TableSkeleton columns={6} />
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (communities.isError) {
    throw communities.error;
  }

  const { meta } = communities.data;

  const chips: FilterChip[] = [
    ...(searchParams.search
      ? [
          {
            key: "search",
            label: `Search: ${searchParams.search}`,
            onRemove: () => update({ search: undefined }),
          },
        ]
      : []),
    ...(searchParams.leadId === undefined
      ? []
      : [
          {
            key: "leadId",
            label: `Owner: ${owner.data?.name ?? "…"}`,
            onRemove: () => update({ leadId: undefined }),
          },
        ]),
    ...(searchParams.isFree === undefined
      ? []
      : [
          {
            key: "isFree",
            label: searchParams.isFree ? "Free only" : "Paid only",
            onRemove: () => update({ isFree: undefined }),
          },
        ]),
    ...(searchParams.hasEmail === undefined
      ? []
      : [
          {
            key: "hasEmail",
            label: searchParams.hasEmail ? "Has email" : "No email",
            onRemove: () => update({ hasEmail: undefined }),
          },
        ]),
    ...(searchParams.minMembers === undefined &&
    searchParams.maxMembers === undefined
      ? []
      : [
          {
            key: "members",
            label: rangeLabel(
              "Members",
              searchParams.minMembers,
              searchParams.maxMembers,
            ),
            onRemove: () =>
              update({ minMembers: undefined, maxMembers: undefined }),
          },
        ]),
    ...(searchParams.minMrr === undefined && searchParams.maxMrr === undefined
      ? []
      : [
          {
            key: "mrr",
            label: rangeLabel(
              "MRR $",
              searchParams.minMrr,
              searchParams.maxMrr,
            ),
            onRemove: () => update({ minMrr: undefined, maxMrr: undefined }),
          },
        ]),
  ];

  const selectedCommunities = communities.data.communities.filter((community) =>
    selection.isSelected(community.communityId),
  );
  const selectedLabel =
    selectedCommunities.length === 1
      ? "1 community"
      : `${selectedCommunities.length} communities`;
  const isMutating = remove.isPending || removeMany.isPending;

  const newCommunity = (
    <Tip
      label="Add a community by hand"
      render={
        <Button
          render={
            <Link
              search={{ leadId: searchParams.leadId }}
              to="/admin/communities/new"
            />
          }
        />
      }
    >
      <PlusIcon />
      New community
    </Tip>
  );

  return (
    <Card>
      <CardContent>
        <div className="space-y-4">
          <CommunityFilters
            createAction={newCommunity}
            isFree={searchParams.isFree}
            onApplyRanges={update}
            onIsFreeChange={(isFree) => update({ isFree })}
            onSearch={(search) => update({ search })}
            onSortChange={(value) => {
              const option = communitySortOptions.find(
                (item) => item.value === value,
              );
              if (option) update({ sort: option.sort, order: option.order });
            }}
            rangeFilters={{
              hasEmail: searchParams.hasEmail,
              minMembers: searchParams.minMembers,
              maxMembers: searchParams.maxMembers,
              minMrr: searchParams.minMrr,
              maxMrr: searchParams.maxMrr,
            }}
            search={searchParams.search}
            sort={sortValue(
              searchParams.sort ?? "createdAt",
              searchParams.order ?? "desc",
            )}
            viewSwitch={<ViewSwitch onChange={setView} view={view} />}
          />
          <FilterChips chips={chips} onClearAll={clearFilters} />
          <div className="flex min-h-9 flex-wrap items-center gap-x-4 gap-y-2">
            <SelectionBar
              actions={
                <BulkDeleteButton
                  consequence={selectedLabel}
                  isPending={removeMany.isPending}
                  label={`Delete ${selectedLabel}`}
                  onConfirm={() =>
                    removeMany.mutate(
                      selectedCommunities.map(
                        (community) => community.communityId,
                      ),
                    )
                  }
                  title={`Delete ${selectedLabel}?`}
                />
              }
              disabled={isMutating}
              selection={selection}
              showSelectAll={view === "cards"}
            />
            {selection.count === 0 && (
              <p className="text-sm text-muted-foreground">
                {meta.total === 1 ? "1 community" : `${meta.total} communities`}
              </p>
            )}
          </div>
          {communities.data.communities.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  {chips.length > 0 ? <SearchXIcon /> : <Building2Icon />}
                </EmptyMedia>
                <EmptyTitle>
                  {chips.length > 0
                    ? "No communities match"
                    : "No communities yet"}
                </EmptyTitle>
                <EmptyDescription>
                  {chips.length > 0
                    ? "Try a different search or remove a filter."
                    : "Communities appear here after a scrape, or you can add one by hand."}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                {chips.length > 0 ? (
                  <Tip
                    label="Remove every filter"
                    render={<Button onClick={clearFilters} variant="outline" />}
                  >
                    Clear filters
                  </Tip>
                ) : (
                  newCommunity
                )}
              </EmptyContent>
            </Empty>
          ) : view === "cards" ? (
            <CommunityCards
              communities={communities.data.communities}
              isMutating={isMutating}
              onRemove={(communityId) => remove.mutate(communityId)}
              removingCommunityId={
                remove.isPending ? remove.variables : undefined
              }
              selection={selection}
              showLead
            />
          ) : (
            <CommunityTable
              communities={communities.data.communities}
              isMutating={isMutating}
              onRemove={(communityId) => remove.mutate(communityId)}
              removingCommunityId={
                remove.isPending ? remove.variables : undefined
              }
              selection={selection}
              showLead
            />
          )}
          <ListPagination
            currentPage={meta.page}
            lastPage={meta.lastPage}
            onPageChange={(page) =>
              navigate({ search: (current) => ({ ...current, page }) })
            }
            onPerPageChange={(perPage) =>
              navigate({
                search: (current) => ({
                  ...current,
                  page: 1,
                  perPage: perPageForUrl(perPage),
                }),
              })
            }
            perPage={resolvePageSize(searchParams.perPage)}
          />
        </div>
      </CardContent>
    </Card>
  );
};

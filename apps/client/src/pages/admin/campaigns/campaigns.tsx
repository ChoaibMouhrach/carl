import { api } from "@/api";
import { FilterChips, type FilterChip } from "@/components/filter-chips";
import { ListPagination } from "@/components/list-pagination";
import { TableSkeleton } from "@/components/table-skeleton";
import { Tip } from "@/components/tip";
import { onError } from "@/lib/base-api";
import { perPageForUrl, resolvePageSize } from "@/lib/page-size";
import { campaignSortOptions, sortValue } from "@/lib/sort-options";
import { adminCampaignsRoute } from "@/routes/admin/campaigns";
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
import { MegaphoneIcon, PlusIcon, SearchXIcon } from "lucide-react";
import { toast } from "sonner";
import { CampaignFilters } from "./campaign-filters";
import { CampaignTable } from "./campaign-table";

export const Campaigns = () => {
  const searchParams = adminCampaignsRoute.useSearch();
  const navigate = adminCampaignsRoute.useNavigate();
  const queryClient = useQueryClient();

  const campaigns = useQuery({
    queryKey: ["admin", "campaigns", "list", searchParams],
    queryFn: () => api.campaign.list(searchParams),
    placeholderData: (previousData) => previousData,
  });

  const remove = useMutation({
    mutationFn: (campaignId: number) => api.campaign.remove({ campaignId }),
    onError,
    onSuccess: async () => {
      toast.success("Campaign deleted.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "campaigns"] });
    },
  });

  const clearFilters = () =>
    navigate({
      search: (current) => ({ ...current, page: 1, search: undefined }),
    });

  if (campaigns.isPending) {
    return (
      <Card>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-9 w-72" />
              <Skeleton className="h-9 w-36" />
              <Skeleton className="ml-auto h-9 w-36" />
            </div>
            <Skeleton className="h-5 w-24" />
            <TableSkeleton columns={7} />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (campaigns.isError) {
    throw campaigns.error;
  }

  const { meta } = campaigns.data;

  const chips: FilterChip[] = searchParams.search
    ? [
        {
          key: "search",
          label: `Search: ${searchParams.search}`,
          onRemove: clearFilters,
        },
      ]
    : [];

  const newCampaign = (
    <Tip
      label="Define a new campaign"
      render={<Button render={<Link to="/admin/campaigns/new" />} />}
    >
      <PlusIcon />
      New campaign
    </Tip>
  );

  return (
    <Card>
      <CardContent>
        <div className="space-y-4">
          <CampaignFilters
            createAction={newCampaign}
            onSearch={(search) =>
              navigate({
                search: (current) => ({ ...current, page: 1, search }),
              })
            }
            onSortChange={(value) => {
              const option = campaignSortOptions.find(
                (item) => item.value === value,
              );
              if (option) {
                navigate({
                  search: (current) => ({
                    ...current,
                    page: 1,
                    sort: option.sort,
                    order: option.order,
                  }),
                });
              }
            }}
            search={searchParams.search}
            sort={sortValue(
              searchParams.sort ?? "createdAt",
              searchParams.order ?? "desc",
            )}
          />
          <FilterChips chips={chips} onClearAll={clearFilters} />
          <p className="text-sm text-muted-foreground">
            {meta.total === 1 ? "1 campaign" : `${meta.total} campaigns`}
          </p>
          {campaigns.data.campaigns.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  {chips.length > 0 ? <SearchXIcon /> : <MegaphoneIcon />}
                </EmptyMedia>
                <EmptyTitle>
                  {chips.length > 0 ? "No campaigns match" : "No campaigns yet"}
                </EmptyTitle>
                <EmptyDescription>
                  {chips.length > 0
                    ? "Try a different search."
                    : "Create a campaign to group the leads and communities you want to reach."}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                {chips.length > 0 ? (
                  <Tip
                    label="Remove the search"
                    render={<Button onClick={clearFilters} variant="outline" />}
                  >
                    Clear filters
                  </Tip>
                ) : (
                  newCampaign
                )}
              </EmptyContent>
            </Empty>
          ) : (
            <CampaignTable
              campaigns={campaigns.data.campaigns}
              isMutating={remove.isPending}
              onRemove={(campaignId) => remove.mutate(campaignId)}
              removingCampaignId={
                remove.isPending ? remove.variables : undefined
              }
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

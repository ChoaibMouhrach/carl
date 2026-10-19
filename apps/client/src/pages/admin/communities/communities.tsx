import { api } from "@/api";
import { DataPagination } from "@/components/data-pagination";
import { CardGridSkeleton } from "@/components/card-grid";
import { TableSkeleton } from "@/components/table-skeleton";
import { SelectionBar } from "@/components/selection-bar";
import { ViewSwitch } from "@/components/view-switch";
import { onError } from "@/lib/base-api";
import { invalidateLeadData } from "@/lib/invalidate";
import { useSelection } from "@/lib/use-selection";
import { useView } from "@/lib/view";
import { adminCommunitiesRoute } from "@/routes/admin/communities";
import { Button } from "@repo/ui/components/ui/button";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CommunityCards } from "./community-cards";
import { CommunityFilters } from "./community-filters";
import { CommunityTable } from "./community-table";

export const Communities = () => {
  const { t } = useTranslation();
  const searchParams = adminCommunitiesRoute.useSearch();
  const { view, setView } = useView();
  const navigate = adminCommunitiesRoute.useNavigate();
  const queryClient = useQueryClient();

  const communities = useQuery({
    queryKey: ["admin", "communities", searchParams],
    queryFn: () => api.community.list(searchParams),
    placeholderData: (previousData) => previousData,
  });

  const selection = useSelection(
    communities.data?.communities.map((community) => community.communityId) ??
      [],
  );

  const remove = useMutation({
    mutationFn: (communityId: number) => api.community.remove({ communityId }),
    onError,
    onSuccess: async () => {
      toast.success(t("adminCommunities.deleted"));
      await invalidateLeadData(queryClient);
    },
  });

  if (communities.isPending) {
    return (
      <Card>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-9 w-64" />
              <Skeleton className="h-9 w-24" />
              <Skeleton className="ml-auto h-9 w-40" />
            </div>
            {view === "cards" ? (
              <CardGridSkeleton />
            ) : (
              <TableSkeleton columns={5} />
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (communities.isError) {
    throw communities.error;
  }

  return (
    <Card>
      <CardContent>
        <div className="space-y-4">
          <CommunityFilters
            createAction={
              <Button render={<Link to="/admin/communities/new" search={{}} />}>
                <PlusIcon />
                {t("adminCommunities.create")}
              </Button>
            }
            viewSwitch={<ViewSwitch onChange={setView} view={view} />}
            onApplyFilters={(filters) =>
              navigate({
                search: (current) => ({ ...current, page: 1, ...filters }),
              })
            }
            onSearch={(search) =>
              navigate({
                search: (current) => ({ ...current, page: 1, search }),
              })
            }
            filters={{
              minMembers: searchParams.minMembers,
              minRevenue: searchParams.minRevenue,
              pricingType: searchParams.pricingType,
              sortBy: searchParams.sortBy,
              sortOrder: searchParams.sortOrder,
            }}
            search={searchParams.search}
          />
          <SelectionBar
            selection={selection}
            showSelectAll={view === "cards"}
          />
          {view === "cards" ? (
            <CommunityCards
              communities={communities.data.communities}
              isMutating={remove.isPending}
              onRemove={(communityId) => remove.mutate(communityId)}
              removingCommunityId={remove.variables}
              selection={selection}
              showLead
            />
          ) : (
            <CommunityTable
              communities={communities.data.communities}
              isMutating={remove.isPending}
              onRemove={(communityId) => remove.mutate(communityId)}
              removingCommunityId={remove.variables}
              selection={selection}
              showLead
            />
          )}
          <DataPagination
            currentPage={communities.data.meta.page}
            lastPage={communities.data.meta.lastPage}
            onPageChange={(page) =>
              navigate({ search: (current) => ({ ...current, page }) })
            }
          />
        </div>
      </CardContent>
    </Card>
  );
};

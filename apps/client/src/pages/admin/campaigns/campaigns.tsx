import { api } from "@/api";
import { DataPagination } from "@/components/data-pagination";
import { TableSkeleton } from "@/components/table-skeleton";
import { onError } from "@/lib/base-api";
import { invalidateCampaignData } from "@/lib/invalidate";
import { adminCampaignsRoute } from "@/routes/admin/campaigns";
import { Button } from "@repo/ui/components/ui/button";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CampaignFilters } from "./campaign-filters";
import { CampaignTable } from "./campaign-table";

export const Campaigns = () => {
  const { t } = useTranslation();
  const searchParams = adminCampaignsRoute.useSearch();
  const navigate = adminCampaignsRoute.useNavigate();
  const queryClient = useQueryClient();

  const campaigns = useQuery({
    queryKey: ["admin", "campaigns", searchParams],
    queryFn: () => api.campaign.list(searchParams),
    placeholderData: (previousData) => previousData,
  });

  const remove = useMutation({
    mutationFn: (campaignId: number) => api.campaign.remove({ campaignId }),
    onError,
    onSuccess: async () => {
      toast.success(t("adminCampaigns.deleted"));
      await invalidateCampaignData(queryClient);
    },
  });

  if (campaigns.isPending) {
    return (
      <Card>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-9 w-64" />
              <Skeleton className="h-9 w-40" />
              <Skeleton className="ml-auto h-9 w-36" />
            </div>
            <TableSkeleton columns={6} />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (campaigns.isError) {
    throw campaigns.error;
  }

  return (
    <Card>
      <CardContent>
        <div className="space-y-4">
          <CampaignFilters
            createAction={
              <Button render={<Link to="/admin/campaigns/new" />}>
                <PlusIcon />
                {t("adminCampaigns.create")}
              </Button>
            }
            onSearch={(search) =>
              navigate({
                search: (current) => ({ ...current, page: 1, search }),
              })
            }
            onStatusChange={(status) =>
              navigate({
                search: (current) => ({ ...current, page: 1, status }),
              })
            }
            search={searchParams.search}
            status={searchParams.status}
          />
          <CampaignTable
            campaigns={campaigns.data.campaigns}
            isMutating={remove.isPending}
            onRemove={(campaignId) => remove.mutate(campaignId)}
            removingCampaignId={remove.variables}
          />
          <DataPagination
            currentPage={campaigns.data.meta.page}
            lastPage={campaigns.data.meta.lastPage}
            onPageChange={(page) =>
              navigate({ search: (current) => ({ ...current, page }) })
            }
          />
        </div>
      </CardContent>
    </Card>
  );
};

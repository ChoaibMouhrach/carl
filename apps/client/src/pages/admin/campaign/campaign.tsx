import { api } from "@/api";
import { onError } from "@/lib/base-api";
import { invalidateCampaignData } from "@/lib/invalidate";
import { adminCampaignRoute } from "@/routes/admin/campaign";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@repo/ui/components/ui/breadcrumb";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { CampaignHeader } from "./campaign-header";
import { Pipeline } from "./pipeline/pipeline";

export const Campaign = () => {
  const { campaignId } = adminCampaignRoute.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const campaign = useQuery({
    queryKey: ["admin", "campaigns", campaignId],
    queryFn: () => api.campaign.show({ campaignId }),
    placeholderData: (previousData) => previousData,
  });

  const removeCampaign = useMutation({
    mutationFn: () => api.campaign.remove({ campaignId }),
    onError,
    onSuccess: async () => {
      toast.success("Campaign deleted.");
      await navigate({ to: "/admin/campaigns", search: { page: 1 } });
      await invalidateCampaignData(queryClient);
    },
  });

  const toggleActive = useMutation({
    mutationFn: (isActive: boolean) =>
      api.campaign.update({ campaignId }, { isActive }),
    onError,
    onSuccess: async (updated) => {
      toast.success(
        updated.isActive ? "Campaign activated." : "Campaign deactivated.",
      );
      await queryClient.invalidateQueries({ queryKey: ["admin", "campaigns"] });
    },
  });

  if (campaign.isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-40" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-5 w-96 max-w-full" />
          <Skeleton className="h-6 w-72" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton className="h-16" key={index} />
          ))}
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (campaign.isError) {
    throw campaign.error;
  }

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              render={<Link search={{ page: 1 }} to="/admin/campaigns" />}
            >
              Campaigns
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{campaign.data.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <CampaignHeader
        campaign={campaign.data}
        isRemovePending={removeCampaign.isPending}
        isTogglePending={toggleActive.isPending}
        onRemove={() => removeCampaign.mutate()}
        onToggleActive={() => toggleActive.mutate(!campaign.data.isActive)}
      />
      <Pipeline campaign={campaign.data} />
    </div>
  );
};

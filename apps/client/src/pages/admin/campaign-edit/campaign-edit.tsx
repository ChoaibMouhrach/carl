import { api } from "@/api";
import { onError } from "@/lib/base-api";
import { invalidateCampaignData } from "@/lib/invalidate";
import { adminCampaignEditRoute } from "@/routes/admin/campaign-edit";
import { Button } from "@repo/ui/components/ui/button";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  CampaignForm,
  type CampaignFormValues,
} from "../campaigns/campaign-form";

export const CampaignEdit = () => {
  const { t } = useTranslation();
  const { campaignId } = adminCampaignEditRoute.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const campaign = useQuery({
    queryKey: ["admin", "campaigns", campaignId],
    queryFn: () => api.campaign.show({ campaignId }),
    placeholderData: (previousData) => previousData,
  });

  const update = useMutation({
    mutationFn: (values: CampaignFormValues) =>
      api.campaign.update({ campaignId }, values),
    onError,
    onSuccess: async () => {
      toast.success(t("adminCampaigns.updatedToast"));
      await invalidateCampaignData(queryClient);
      await navigate({
        to: "/admin/campaigns/$campaignId",
        params: { campaignId },
        search: { page: 1 },
      });
    },
  });

  if (campaign.isPending) {
    return (
      <Card>
        <CardContent className="space-y-6">
          {Array.from({ length: 2 }, (_, index) => (
            <div className="space-y-2" key={index}>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
          <div className="flex gap-2">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-20" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (campaign.isError) {
    throw campaign.error;
  }

  return (
    <CampaignForm
      campaign={campaign.data.campaign}
      cancelAction={
        <Button
          render={
            <Link
              params={{ campaignId }}
              search={{ page: 1 }}
              to="/admin/campaigns/$campaignId"
            />
          }
          variant="outline"
        >
          {t("campaignForm.cancel")}
        </Button>
      }
      isPending={update.isPending}
      onSubmit={(values) => update.mutateAsync(values)}
    />
  );
};

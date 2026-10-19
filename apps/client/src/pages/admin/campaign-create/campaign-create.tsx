import { api } from "@/api";
import { onError } from "@/lib/base-api";
import { invalidateCampaignData } from "@/lib/invalidate";
import { Button } from "@repo/ui/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  CampaignForm,
  type CampaignFormValues,
} from "../campaigns/campaign-form";

export const CampaignCreate = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: (values: CampaignFormValues) => api.campaign.create(values),
    onError,
    onSuccess: async ({ campaign }) => {
      toast.success("Campaign created.");
      await invalidateCampaignData(queryClient);
      await navigate({
        to: "/admin/campaigns/$campaignId",
        params: { campaignId: campaign.campaignId },
        search: { page: 1 },
      });
    },
  });

  return (
    <CampaignForm
      cancelAction={
        <Button
          render={<Link search={{ page: 1 }} to="/admin/campaigns" />}
          variant="outline"
        >
          Cancel
        </Button>
      }
      isPending={create.isPending}
      onSubmit={(values) => create.mutateAsync(values)}
    />
  );
};

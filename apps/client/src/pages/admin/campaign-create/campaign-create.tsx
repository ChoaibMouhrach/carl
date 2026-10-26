import { api } from "@/api";
import { Tip } from "@/components/tip";
import { onError } from "@/lib/base-api";
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
    onSuccess: async () => {
      toast.success("Campaign created.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "campaigns"] });
      await navigate({ to: "/admin/campaigns", search: { page: 1 } });
    },
  });

  return (
    <CampaignForm
      cancelAction={
        <Tip
          label="Go back without saving"
          render={
            <Button
              render={<Link search={{ page: 1 }} to="/admin/campaigns" />}
              variant="outline"
            />
          }
        >
          Cancel
        </Tip>
      }
      isPending={create.isPending}
      onSubmit={(values) => create.mutateAsync(values)}
    />
  );
};

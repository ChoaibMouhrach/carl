import { api } from "@/api";
import { Tip } from "@/components/tip";
import { onError } from "@/lib/base-api";
import { invalidateLeadData } from "@/lib/invalidate";
import { Button } from "@repo/ui/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { LeadForm, type LeadFormValues } from "../leads/lead-form";

export const LeadCreate = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: (values: LeadFormValues) => api.lead.create(values),
    onError,
    onSuccess: async (lead) => {
      toast.success("Lead created.");
      await invalidateLeadData(queryClient);
      await navigate({
        to: "/admin/leads/$leadId",
        params: { leadId: lead.leadId },
      });
    },
  });

  return (
    <LeadForm
      cancelAction={
        <Tip
          label="Go back without saving"
          render={
            <Button
              render={<Link search={{ page: 1 }} to="/admin/leads" />}
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

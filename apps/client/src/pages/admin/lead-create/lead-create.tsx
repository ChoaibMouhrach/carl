import { api } from "@/api";
import { onError } from "@/lib/base-api";
import { invalidateLeadData } from "@/lib/invalidate";
import { Button } from "@repo/ui/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { LeadForm, type LeadFormValues } from "../leads/lead-form";

export const LeadCreate = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: (values: LeadFormValues) => api.lead.create(values),
    onError,
    onSuccess: async ({ lead }) => {
      toast.success(t("adminLeads.created"));
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
        <Button
          render={<Link search={{ page: 1 }} to="/admin/leads" />}
          variant="outline"
        >
          {t("leadForm.cancel")}
        </Button>
      }
      isPending={create.isPending}
      onSubmit={(values) => create.mutateAsync(values)}
    />
  );
};

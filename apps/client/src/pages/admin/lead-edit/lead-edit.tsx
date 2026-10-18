import { api } from "@/api";
import { onError } from "@/lib/base-api";
import { invalidateLeadData } from "@/lib/invalidate";
import { toLeadUpdate } from "@/lib/lead-update";
import { adminLeadEditRoute } from "@/routes/admin/lead-edit";
import { Button } from "@repo/ui/components/ui/button";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { LeadForm, type LeadFormValues } from "../leads/lead-form";

export const LeadEdit = () => {
  const { t } = useTranslation();
  const { leadId } = adminLeadEditRoute.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const lead = useQuery({
    queryKey: ["admin", "leads", leadId],
    queryFn: () => api.lead.show({ leadId }),
    placeholderData: (previousData) => previousData,
  });

  const update = useMutation({
    mutationFn: (values: LeadFormValues) =>
      api.lead.update({ leadId }, toLeadUpdate(values)),
    onError,
    onSuccess: async () => {
      toast.success(t("adminLeads.updated"));
      await invalidateLeadData(queryClient);
      await navigate({ to: "/admin/leads/$leadId", params: { leadId } });
    },
  });

  if (lead.isPending) {
    return (
      <Card>
        <CardContent className="space-y-6">
          {Array.from({ length: 8 }, (_, index) => (
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

  if (lead.isError) {
    throw lead.error;
  }

  return (
    <LeadForm
      cancelAction={
        <Button
          render={<Link params={{ leadId }} to="/admin/leads/$leadId" />}
          variant="outline"
        >
          {t("leadForm.cancel")}
        </Button>
      }
      isPending={update.isPending}
      lead={lead.data.lead}
      onSubmit={(values) => update.mutateAsync(values)}
    />
  );
};

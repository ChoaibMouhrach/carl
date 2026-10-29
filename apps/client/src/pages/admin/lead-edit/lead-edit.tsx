import { api } from "@/api";
import { Tip } from "@/components/tip";
import { onError } from "@/lib/base-api";
import { invalidateLeadData } from "@/lib/invalidate";
import { adminLeadEditRoute } from "@/routes/admin/lead-edit";
import { Button } from "@repo/ui/components/ui/button";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { LeadForm, type LeadFormValues } from "../leads/lead-form";

export const LeadEdit = () => {
  const { leadId } = adminLeadEditRoute.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const lead = useQuery({
    queryKey: ["admin", "leads", leadId],
    queryFn: () => api.lead.show({ leadId }),
    placeholderData: (previousData) => previousData,
  });

  const update = useMutation({
    mutationFn: (values: LeadFormValues) => api.lead.update({ leadId }, values),
    onError,
    onSuccess: async () => {
      toast.success("Lead updated.");
      await invalidateLeadData(queryClient);
      await navigate({ to: "/admin/leads", search: { page: 1 } });
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
            <Skeleton className="h-9 w-24" />
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
      isPending={update.isPending}
      lead={lead.data}
      onSubmit={(values) => update.mutateAsync(values)}
    />
  );
};

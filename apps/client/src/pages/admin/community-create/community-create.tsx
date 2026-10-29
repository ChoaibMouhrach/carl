import { api } from "@/api";
import { Tip } from "@/components/tip";
import { useLeadOptions } from "@/hooks/use-lead-options";
import { onError } from "@/lib/base-api";
import { invalidateLeadData } from "@/lib/invalidate";
import { adminCommunityCreateRoute } from "@/routes/admin/community-create";
import { Button } from "@repo/ui/components/ui/button";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  CommunityForm,
  type CommunityFormValues,
} from "../communities/community-form";

export const CommunityCreate = () => {
  const { leadId } = adminCommunityCreateRoute.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { leads, onSearch } = useLeadOptions();

  const presetLead = useQuery({
    queryKey: ["admin", "leads", leadId],
    queryFn: () => api.lead.show({ leadId: leadId ?? 0 }),
    enabled: leadId !== undefined,
    placeholderData: (previousData) => previousData,
  });

  const create = useMutation({
    mutationFn: (values: CommunityFormValues) => api.community.create(values),
    onError,
    onSuccess: async () => {
      toast.success("Community created.");
      await invalidateLeadData(queryClient);
      await navigate({ to: "/admin/communities", search: { page: 1 } });
    },
  });

  if (leadId !== undefined && presetLead.isPending) {
    return (
      <Card>
        <CardContent className="space-y-6">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="space-y-2" key={index}>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <CommunityForm
      cancelAction={
        <Tip
          label="Go back without saving"
          render={
            <Button
              render={<Link search={{ page: 1 }} to="/admin/communities" />}
              variant="outline"
            />
          }
        >
          Cancel
        </Tip>
      }
      initialLead={presetLead.data ?? null}
      isPending={create.isPending}
      leads={leads}
      onLeadSearch={onSearch}
      onSubmit={(values) => create.mutateAsync(values)}
    />
  );
};

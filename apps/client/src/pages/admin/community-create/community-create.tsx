import { api } from "@/api";
import { onError } from "@/lib/base-api";
import { invalidateLeadData } from "@/lib/invalidate";
import { adminCommunityCreateRoute } from "@/routes/admin/community-create";
import { Button } from "@repo/ui/components/ui/button";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useDebounce } from "use-debounce";
import {
  CommunityForm,
  type CommunityFormValues,
} from "../communities/community-form";

export const CommunityCreate = () => {
  const { leadId } = adminCommunityCreateRoute.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [leadSearch, setLeadSearch] = useState("");
  const [debouncedLeadSearch] = useDebounce(leadSearch, 300);

  const leads = useQuery({
    queryKey: ["admin", "leads", "options", debouncedLeadSearch],
    queryFn: () =>
      api.lead.list({ search: debouncedLeadSearch.trim() || undefined }),
    placeholderData: (previousData) => previousData,
  });

  const presetLead = useQuery({
    queryKey: ["admin", "leads", leadId],
    queryFn: () => api.lead.show({ leadId: leadId ?? 0 }),
    enabled: leadId !== undefined,
    placeholderData: (previousData) => previousData,
  });

  const create = useMutation({
    mutationFn: (values: CommunityFormValues) => {
      const { price, ...fields } = values;
      return api.community.create({ ...fields, prices: [price] });
    },
    onError,
    onSuccess: async (_, values) => {
      toast.success("Community created.");
      await invalidateLeadData(queryClient);

      if (leadId === undefined) {
        await navigate({ to: "/admin/communities", search: { page: 1 } });
        return;
      }

      await navigate({
        to: "/admin/leads/$leadId",
        params: { leadId: values.leadId },
      });
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

  const initialLead = presetLead.data?.lead ?? null;

  return (
    <CommunityForm
      cancelAction={
        <Button
          render={<Link search={{ page: 1 }} to="/admin/communities" />}
          variant="outline"
        >
          Cancel
        </Button>
      }
      initialLead={initialLead}
      isPending={create.isPending}
      leads={leads.data?.leads ?? []}
      onLeadSearch={setLeadSearch}
      onSubmit={(values) => create.mutateAsync(values)}
    />
  );
};

import { api } from "@/api";
import { onError } from "@/lib/base-api";
import { toCommunityUpdate } from "@/lib/community-update";
import { invalidateLeadData } from "@/lib/invalidate";
import { adminCommunityEditRoute } from "@/routes/admin/community-edit";
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

export const CommunityEdit = () => {
  const { communityId } = adminCommunityEditRoute.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [leadSearch, setLeadSearch] = useState("");
  const [debouncedLeadSearch] = useDebounce(leadSearch, 300);

  const community = useQuery({
    queryKey: ["admin", "communities", communityId],
    queryFn: () => api.community.show({ communityId }),
    placeholderData: (previousData) => previousData,
  });

  const leads = useQuery({
    queryKey: ["admin", "leads", "options", debouncedLeadSearch],
    queryFn: () =>
      api.lead.list({ search: debouncedLeadSearch.trim() || undefined }),
    placeholderData: (previousData) => previousData,
  });

  const update = useMutation({
    mutationFn: (values: CommunityFormValues) =>
      api.community.update(
        { communityId },
        toCommunityUpdate(values, community.data?.community.prices ?? []),
      ),
    onError,
    onSuccess: async () => {
      toast.success("Community updated.");
      await invalidateLeadData(queryClient);
      await navigate({ to: "/admin/communities", search: { page: 1 } });
    },
  });

  if (community.isPending) {
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

  if (community.isError) {
    throw community.error;
  }

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
      community={community.data.community}
      initialLead={community.data.lead}
      isPending={update.isPending}
      leads={leads.data?.leads ?? []}
      onLeadSearch={setLeadSearch}
      onSubmit={(values) => update.mutateAsync(values)}
    />
  );
};

import { api } from "@/api";
import { Tip } from "@/components/tip";
import { useLeadOptions } from "@/hooks/use-lead-options";
import { onError } from "@/lib/base-api";
import { invalidateLeadData } from "@/lib/invalidate";
import { adminCommunityEditRoute } from "@/routes/admin/community-edit";
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

export const CommunityEdit = () => {
  const { communityId } = adminCommunityEditRoute.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { leads, onSearch } = useLeadOptions();

  const community = useQuery({
    queryKey: ["admin", "communities", communityId],
    queryFn: () => api.community.show({ communityId }),
    placeholderData: (previousData) => previousData,
  });

  const update = useMutation({
    mutationFn: (values: CommunityFormValues) =>
      api.community.update({ communityId }, values),
    onError,
    onSuccess: async () => {
      toast.success("Community updated.");
      await invalidateLeadData(queryClient);
      await navigate({
        to: "/admin/communities/$communityId",
        params: { communityId },
      });
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
            <Skeleton className="h-9 w-32" />
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
        <Tip
          label="Go back without saving"
          render={
            <Button
              render={
                <Link
                  params={{ communityId }}
                  to="/admin/communities/$communityId"
                />
              }
              variant="outline"
            />
          }
        >
          Cancel
        </Tip>
      }
      community={community.data}
      initialLead={community.data.lead}
      isPending={update.isPending}
      leads={leads}
      onLeadSearch={onSearch}
      onSubmit={(values) => update.mutateAsync(values)}
    />
  );
};

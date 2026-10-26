import { api } from "@/api";
import { onError } from "@/lib/base-api";
import { invalidateLeadData } from "@/lib/invalidate";
import { adminCommunityRoute } from "@/routes/admin/community";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@repo/ui/components/ui/breadcrumb";
import { Card, CardContent, CardHeader } from "@repo/ui/components/ui/card";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { CommunityDetails } from "./community-details";
import { CommunityHeader } from "./community-header";

export const Community = () => {
  const { communityId } = adminCommunityRoute.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const community = useQuery({
    queryKey: ["admin", "communities", communityId],
    queryFn: () => api.community.show({ communityId }),
    placeholderData: (previousData) => previousData,
  });

  const remove = useMutation({
    mutationFn: () => api.community.remove({ communityId }),
    onError,
    onSuccess: async () => {
      toast.success("Community deleted.");
      await navigate({ to: "/admin/communities", search: { page: 1 } });
      await invalidateLeadData(queryClient);
    },
  });

  if (community.isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-48" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-72" />
            <Skeleton className="h-5 w-40" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton className="h-24 w-full" key={index} />
          ))}
        </div>
        <div className="grid items-start gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-5/6" />
                <Skeleton className="h-5 w-2/3" />
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-24" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-5 w-40" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (community.isError) {
    throw community.error;
  }

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              render={<Link search={{ page: 1 }} to="/admin/communities" />}
            >
              Communities
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{community.data.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <CommunityHeader
        community={community.data}
        isRemovePending={remove.isPending}
        onRemove={() => remove.mutate()}
      />
      <CommunityDetails community={community.data} />
    </div>
  );
};

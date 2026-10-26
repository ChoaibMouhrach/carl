import { api } from "@/api";
import { TableSkeleton } from "@/components/table-skeleton";
import { onError } from "@/lib/base-api";
import { reportBulkDelete } from "@/lib/bulk-delete";
import { invalidateLeadData } from "@/lib/invalidate";
import { useSelection } from "@/lib/use-selection";
import { adminLeadRoute } from "@/routes/admin/lead";
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
import { LeadCommunities } from "./lead-communities";
import { LeadDetails } from "./lead-details";
import { LeadHeader } from "./lead-header";

export const Lead = () => {
  const { leadId } = adminLeadRoute.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const lead = useQuery({
    queryKey: ["admin", "leads", leadId],
    queryFn: () => api.lead.show({ leadId }),
    placeholderData: (previousData) => previousData,
  });

  const selection = useSelection(
    lead.data?.communities.map((community) => community.communityId) ?? [],
  );

  const removeLead = useMutation({
    mutationFn: () => api.lead.remove({ leadId }),
    onError,
    onSuccess: async () => {
      toast.success("Lead deleted.");
      await navigate({ to: "/admin/leads", search: { page: 1 } });
      await invalidateLeadData(queryClient);
    },
  });

  const removeCommunity = useMutation({
    mutationFn: (communityId: number) => api.community.remove({ communityId }),
    onError,
    onSuccess: async () => {
      toast.success("Community deleted.");
      await invalidateLeadData(queryClient);
    },
  });

  const removeCommunities = useMutation({
    mutationFn: (communityIds: number[]) =>
      api.community.removeMany({ communityIds }),
    onError,
    onSuccess: async (result) => {
      reportBulkDelete(result.deleted, {
        one: "community",
        many: "communities",
      });
      selection.clear();
      await invalidateLeadData(queryClient);
    },
  });

  if (lead.isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-40" />
        <div className="flex items-center gap-4">
          <Skeleton className="size-14 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-5 w-40" />
          </div>
        </div>
        <div className="grid items-start gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
              </CardHeader>
              <CardContent>
                <TableSkeleton columns={5} rows={3} />
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-24" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-5 w-40" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (lead.isError) {
    throw lead.error;
  }

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              render={<Link search={{ page: 1 }} to="/admin/leads" />}
            >
              Leads
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{lead.data.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <LeadHeader
        isRemovePending={removeLead.isPending}
        lead={lead.data}
        onRemove={() => removeLead.mutate()}
      />
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LeadCommunities
            communities={lead.data.communities}
            isMutating={
              removeCommunity.isPending || removeCommunities.isPending
            }
            isRemovingMany={removeCommunities.isPending}
            leadId={leadId}
            onRemove={(communityId) => removeCommunity.mutate(communityId)}
            onRemoveMany={(communityIds) =>
              removeCommunities.mutate(communityIds)
            }
            removingCommunityId={
              removeCommunity.isPending ? removeCommunity.variables : undefined
            }
            selection={selection}
          />
        </div>
        <LeadDetails lead={lead.data} />
      </div>
    </div>
  );
};

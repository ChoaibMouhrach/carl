import { api } from "@/api";
import { ListPagination } from "@/components/list-pagination";
import { TableSkeleton } from "@/components/table-skeleton";
import { onError } from "@/lib/base-api";
import { invalidateCampaignData } from "@/lib/invalidate";
import { perPageForUrl, resolvePageSize } from "@/lib/page-size";
import { useSelection } from "@/lib/use-selection";
import { adminCampaignRoute } from "@/routes/admin/campaign";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@repo/ui/components/ui/breadcrumb";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/ui/tabs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { CampaignCommunities } from "./campaign-communities";
import { CampaignHeader } from "./campaign-header";
import { CampaignLeads } from "./campaign-leads";

export const Campaign = () => {
  const { campaignId } = adminCampaignRoute.useParams();
  const searchParams = adminCampaignRoute.useSearch();
  const routeNavigate = adminCampaignRoute.useNavigate();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const campaign = useQuery({
    queryKey: ["admin", "campaigns", campaignId],
    queryFn: () => api.campaign.show({ campaignId }),
    placeholderData: (previousData) => previousData,
  });

  const leads = useQuery({
    queryKey: ["admin", "leads", "campaign", campaignId, searchParams],
    queryFn: () =>
      api.lead.list({
        campaignId,
        page: searchParams.page,
        perPage: searchParams.perPage,
      }),
    enabled: searchParams.tab === "leads",
    placeholderData: (previousData) => previousData,
  });

  const communities = useQuery({
    queryKey: ["admin", "communities", "campaign", campaignId, searchParams],
    queryFn: () =>
      api.community.list({
        campaignId,
        page: searchParams.page,
        perPage: searchParams.perPage,
      }),
    enabled: searchParams.tab === "communities",
    placeholderData: (previousData) => previousData,
  });

  const leadSelection = useSelection(
    leads.data?.leads.map((lead) => lead.leadId) ?? [],
  );
  const communitySelection = useSelection(
    communities.data?.communities.map((community) => community.communityId) ??
      [],
  );

  const removeCampaign = useMutation({
    mutationFn: () => api.campaign.remove({ campaignId }),
    onError,
    onSuccess: async () => {
      toast.success("Campaign deleted.");
      await navigate({ to: "/admin/campaigns", search: { page: 1 } });
      await invalidateCampaignData(queryClient);
    },
  });

  const removeLeads = useMutation({
    mutationFn: (leadIds: number[]) =>
      api.campaign.removeLeads({ campaignId }, { leadIds }),
    onError,
    onSuccess: async (result) => {
      toast.success(
        result.removed === 1
          ? "1 lead removed from the campaign."
          : `${result.removed} leads removed from the campaign.`,
      );
      leadSelection.clear();
      await invalidateCampaignData(queryClient);
    },
  });

  const removeCommunities = useMutation({
    mutationFn: (communityIds: number[]) =>
      api.campaign.removeCommunities({ campaignId }, { communityIds }),
    onError,
    onSuccess: async (result) => {
      toast.success(
        result.removed === 1
          ? "1 community removed from the campaign."
          : `${result.removed} communities removed from the campaign.`,
      );
      communitySelection.clear();
      await invalidateCampaignData(queryClient);
    },
  });

  if (campaign.isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-40" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-5 w-96 max-w-full" />
          <Skeleton className="h-6 w-72" />
        </div>
        <Card>
          <CardContent>
            <div className="space-y-4">
              <Skeleton className="h-9 w-64" />
              <TableSkeleton columns={4} />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (campaign.isError) {
    throw campaign.error;
  }

  const active = searchParams.tab === "leads" ? leads : communities;

  if (active.isError) {
    throw active.error;
  }

  const meta = active.data?.meta;

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              render={<Link search={{ page: 1 }} to="/admin/campaigns" />}
            >
              Campaigns
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{campaign.data.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <CampaignHeader
        campaign={campaign.data}
        isRemovePending={removeCampaign.isPending}
        onRemove={() => removeCampaign.mutate()}
      />
      <Card>
        <CardContent>
          <Tabs
            onValueChange={(tab) =>
              routeNavigate({
                search: (current) => ({
                  ...current,
                  tab: tab === "communities" ? "communities" : "leads",
                  page: 1,
                }),
              })
            }
            value={searchParams.tab}
          >
            <TabsList>
              <TabsTrigger value="leads">
                {`Leads (${campaign.data.leadsCount})`}
              </TabsTrigger>
              <TabsTrigger value="communities">
                {`Communities (${campaign.data.communitiesCount})`}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="leads">
              {!leads.data ? (
                <TableSkeleton columns={4} />
              ) : (
                <CampaignLeads
                  isRemoving={removeLeads.isPending}
                  leads={leads.data.leads}
                  onRemove={(leadIds) => removeLeads.mutate(leadIds)}
                  selection={leadSelection}
                />
              )}
            </TabsContent>
            <TabsContent value="communities">
              {!communities.data ? (
                <TableSkeleton columns={5} />
              ) : (
                <CampaignCommunities
                  communities={communities.data.communities}
                  isRemoving={removeCommunities.isPending}
                  onRemove={(communityIds) =>
                    removeCommunities.mutate(communityIds)
                  }
                  selection={communitySelection}
                />
              )}
            </TabsContent>
          </Tabs>
          {meta && (
            <div className="mt-4">
              <ListPagination
                currentPage={meta.page}
                lastPage={meta.lastPage}
                onPageChange={(page) =>
                  routeNavigate({
                    search: (current) => ({ ...current, page }),
                  })
                }
                onPerPageChange={(perPage) =>
                  routeNavigate({
                    search: (current) => ({
                      ...current,
                      page: 1,
                      perPage: perPageForUrl(perPage),
                    }),
                  })
                }
                perPage={resolvePageSize(searchParams.perPage)}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

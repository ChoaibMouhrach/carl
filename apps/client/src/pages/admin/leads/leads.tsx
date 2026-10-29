import type { CampaignPipelineStep } from "@repo/constants/pipeline";
import { api } from "@/api";
import { AddToCampaignButton } from "@/components/add-to-campaign-button";
import { BulkDeleteButton } from "@/components/bulk-delete-button";
import { CardGridSkeleton } from "@/components/card-grid";
import { FilterChips, type FilterChip } from "@/components/filter-chips";
import { ListPagination } from "@/components/list-pagination";
import { SelectionBar } from "@/components/selection-bar";
import { TableSkeleton } from "@/components/table-skeleton";
import { Tip } from "@/components/tip";
import { ViewSwitch } from "@/components/view-switch";
import { useCampaignOptions } from "@/hooks/use-campaign-options";
import { onError } from "@/lib/base-api";
import { reportBulkDelete } from "@/lib/bulk-delete";
import { invalidateCampaignData, invalidateLeadData } from "@/lib/invalidate";
import { perPageForUrl, resolvePageSize } from "@/lib/page-size";
import { leadSortOptions, sortValue } from "@/lib/sort-options";
import { useSelection } from "@/lib/use-selection";
import { useView } from "@/lib/view";
import { adminLeadsRoute } from "@/routes/admin/leads";
import { Button } from "@repo/ui/components/ui/button";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/ui/empty";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PlusIcon, SearchXIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";
import { LeadCards } from "./lead-cards";
import { LeadFilters } from "./lead-filters";
import { LeadTable } from "./lead-table";

export const Leads = () => {
  const searchParams = adminLeadsRoute.useSearch();
  const navigate = adminLeadsRoute.useNavigate();
  return <LeadList searchParams={searchParams} navigate={navigate} />;
};

type LeadSearch = ReturnType<typeof adminLeadsRoute.useSearch>;

interface LeadListProps {
  searchParams: LeadSearch;
  navigate: (options: {
    search: (current: LeadSearch) => LeadSearch;
  }) => unknown;
  campaignId?: number;
  pipelineStep?: CampaignPipelineStep;
  emptyDescription?: string;
}

export const LeadList = ({
  searchParams,
  navigate,
  campaignId,
  pipelineStep,
  emptyDescription,
}: LeadListProps) => {
  const { view, setView } = useView();
  const queryClient = useQueryClient();

  const leads = useQuery({
    queryKey: [
      "admin",
      "leads",
      pipelineStep ?? "all",
      campaignId ?? searchParams.campaignId ?? null,
      { ...searchParams, campaignId: campaignId ?? searchParams.campaignId },
    ],
    queryFn: () =>
      api.lead.list({
        ...searchParams,
        pipelineStep,
        campaignId: campaignId ?? searchParams.campaignId,
      }),
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[2] === (pipelineStep ?? "all") &&
      previousQuery?.queryKey[3] ===
        (campaignId ?? searchParams.campaignId ?? null)
        ? previousData
        : undefined,
  });

  const selection = useSelection(
    leads.data?.leads.map((lead) => lead.leadId) ?? [],
  );

  const removeMany = useMutation({
    mutationFn: (leadIds: number[]) => api.lead.removeMany({ leadIds }),
    onError,
    onSuccess: async (result) => {
      reportBulkDelete(result.deleted, { one: "lead", many: "leads" });
      selection.clear();
      await invalidateLeadData(queryClient);
    },
  });

  const campaigns = useCampaignOptions();

  const addToCampaign = useMutation({
    mutationFn: (input: { campaignId: number; leadIds: number[] }) =>
      api.campaign.addLeads(
        { campaignId: input.campaignId },
        { leadIds: input.leadIds },
      ),
    onError,
    onSuccess: async (result) => {
      toast.success(
        result.added === 0
          ? "Already in that campaign."
          : result.added === 1
            ? "1 lead added to the campaign."
            : `${result.added} leads added to the campaign.`,
      );
      selection.clear();
      await invalidateCampaignData(queryClient);
    },
  });

  const remove = useMutation({
    mutationFn: (leadId: number) => api.lead.remove({ leadId }),
    onError,
    onSuccess: async () => {
      toast.success("Lead deleted.");
      await invalidateLeadData(queryClient);
    },
  });

  const clearFilters = () =>
    navigate({
      search: (current) => ({
        ...current,
        page: 1,
        search: undefined,
        hasEmail: undefined,
        campaignId: undefined,
      }),
    });

  if (leads.isPending) {
    return (
      <Card>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-9 w-72" />
              <Skeleton className="h-9 w-32" />
              <Skeleton className="h-9 w-36" />
              <Skeleton className="ml-auto h-9 w-28" />
            </div>
            <Skeleton className="h-5 w-24" />
            {view === "cards" ? (
              <CardGridSkeleton />
            ) : (
              <TableSkeleton columns={5} />
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (leads.isError) {
    throw leads.error;
  }

  const { meta } = leads.data;

  const chips: FilterChip[] = [
    ...(searchParams.search
      ? [
          {
            key: "search",
            label: `Search: ${searchParams.search}`,
            onRemove: () =>
              navigate({
                search: (current) => ({
                  ...current,
                  page: 1,
                  search: undefined,
                }),
              }),
          },
        ]
      : []),
    ...(searchParams.hasEmail === undefined
      ? []
      : [
          {
            key: "hasEmail",
            label: searchParams.hasEmail ? "Has email" : "No email",
            onRemove: () =>
              navigate({
                search: (current) => ({
                  ...current,
                  page: 1,
                  hasEmail: undefined,
                }),
              }),
          },
        ]),
    ...(campaignId !== undefined || searchParams.campaignId === undefined
      ? []
      : [
          {
            key: "campaignId",
            label: `Campaign: ${campaigns.find((item) => item.value === String(searchParams.campaignId))?.label ?? "…"}`,
            onRemove: () =>
              navigate({
                search: (current) => ({
                  ...current,
                  page: 1,
                  campaignId: undefined,
                }),
              }),
          },
        ]),
  ];

  const selectedLeads = leads.data.leads.filter((lead) =>
    selection.isSelected(lead.leadId),
  );
  const selectedCommunities = selectedLeads.reduce(
    (total, lead) => total + lead.communitiesCount,
    0,
  );
  const selectedLabel =
    selectedLeads.length === 1 ? "1 lead" : `${selectedLeads.length} leads`;
  const isMutating =
    remove.isPending || removeMany.isPending || addToCampaign.isPending;

  const newLead = (
    <Tip
      label="Add a lead by hand"
      render={<Button render={<Link to="/admin/leads/new" />} />}
    >
      <PlusIcon />
      New lead
    </Tip>
  );

  return (
    <Card>
      <CardContent>
        <div className="space-y-4">
          <LeadFilters
            campaignId={searchParams.campaignId}
            campaigns={campaignId === undefined ? campaigns : undefined}
            createAction={campaignId === undefined ? newLead : undefined}
            onCampaignChange={(campaignId) =>
              navigate({
                search: (current) => ({ ...current, page: 1, campaignId }),
              })
            }
            hasEmail={searchParams.hasEmail}
            onHasEmailChange={(hasEmail) =>
              navigate({
                search: (current) => ({ ...current, page: 1, hasEmail }),
              })
            }
            onSearch={(search) =>
              navigate({
                search: (current) => ({ ...current, page: 1, search }),
              })
            }
            onSortChange={(value) => {
              const option = leadSortOptions.find(
                (item) => item.value === value,
              );
              if (option) {
                navigate({
                  search: (current) => ({
                    ...current,
                    page: 1,
                    sort: option.sort,
                    order: option.order,
                  }),
                });
              }
            }}
            search={searchParams.search}
            sort={sortValue(
              searchParams.sort ?? "createdAt",
              searchParams.order ?? "desc",
            )}
            viewSwitch={<ViewSwitch onChange={setView} view={view} />}
          />
          <FilterChips chips={chips} onClearAll={clearFilters} />
          <div className="flex min-h-9 flex-wrap items-center gap-x-4 gap-y-2">
            <SelectionBar
              actions={
                <>
                  <AddToCampaignButton
                    campaigns={campaigns}
                    isPending={addToCampaign.isPending}
                    onConfirm={(campaignId) =>
                      addToCampaign.mutateAsync({
                        campaignId,
                        leadIds: selectedLeads.map((lead) => lead.leadId),
                      })
                    }
                    subject={selectedLabel}
                  />
                  <BulkDeleteButton
                    consequence={
                      selectedCommunities === 0
                        ? selectedLabel
                        : `${selectedLabel} and their ${selectedCommunities === 1 ? "1 community" : `${selectedCommunities} communities`}`
                    }
                    isPending={removeMany.isPending}
                    label={`Delete ${selectedLabel}`}
                    onConfirm={() =>
                      removeMany.mutate(
                        selectedLeads.map((lead) => lead.leadId),
                      )
                    }
                    title={`Delete ${selectedLabel}?`}
                  />
                </>
              }
              disabled={isMutating}
              selection={selection}
              showSelectAll={view === "cards"}
            />
            {selection.count === 0 && (
              <p className="text-sm text-muted-foreground">
                {meta.total === 1 ? "1 lead" : `${meta.total} leads`}
              </p>
            )}
          </div>
          {leads.data.leads.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  {chips.length > 0 ? <SearchXIcon /> : <UsersIcon />}
                </EmptyMedia>
                <EmptyTitle>
                  {chips.length > 0 ? "No leads match" : "No leads yet"}
                </EmptyTitle>
                <EmptyDescription>
                  {chips.length > 0
                    ? "Try a different search or remove a filter."
                    : (emptyDescription ??
                      "Leads appear here after a scrape, or you can add one by hand.")}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                {chips.length > 0 ? (
                  <Tip
                    label="Remove every filter"
                    render={<Button onClick={clearFilters} variant="outline" />}
                  >
                    Clear filters
                  </Tip>
                ) : campaignId === undefined ? (
                  newLead
                ) : null}
              </EmptyContent>
            </Empty>
          ) : view === "cards" ? (
            <LeadCards
              isMutating={isMutating}
              leads={leads.data.leads}
              onRemove={(leadId) => remove.mutate(leadId)}
              removingLeadId={remove.isPending ? remove.variables : undefined}
              selection={selection}
            />
          ) : (
            <LeadTable
              isMutating={isMutating}
              leads={leads.data.leads}
              onRemove={(leadId) => remove.mutate(leadId)}
              removingLeadId={remove.isPending ? remove.variables : undefined}
              selection={selection}
            />
          )}
          <ListPagination
            currentPage={meta.page}
            lastPage={meta.lastPage}
            onPageChange={(page) =>
              navigate({ search: (current) => ({ ...current, page }) })
            }
            onPerPageChange={(perPage) =>
              navigate({
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
      </CardContent>
    </Card>
  );
};

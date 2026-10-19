import { api } from "@/api";
import { DataPagination } from "@/components/data-pagination";
import { CardGridSkeleton } from "@/components/card-grid";
import { TableSkeleton } from "@/components/table-skeleton";
import { SelectionBar } from "@/components/selection-bar";
import { ExportButton } from "@/components/export-button";
import { ViewSwitch } from "@/components/view-switch";
import { onError } from "@/lib/base-api";
import { invalidateLeadData } from "@/lib/invalidate";
import { useSelection } from "@/lib/use-selection";
import { useView } from "@/lib/view";
import { adminLeadsRoute } from "@/routes/admin/leads";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@repo/ui/components/ui/button";
import { toast } from "sonner";
import { LeadCards } from "./lead-cards";
import { LeadFilters } from "./lead-filters";
import { LeadTable } from "./lead-table";

export const Leads = () => {
  const searchParams = adminLeadsRoute.useSearch();
  const { view, setView } = useView();
  const navigate = adminLeadsRoute.useNavigate();
  const queryClient = useQueryClient();

  const leads = useQuery({
    queryKey: ["admin", "leads", searchParams],
    queryFn: () => api.lead.list(searchParams),
    placeholderData: (previousData) => previousData,
  });

  const selection = useSelection(
    leads.data?.leads.map((lead) => lead.leadId) ?? [],
  );

  const remove = useMutation({
    mutationFn: (leadId: number) => api.lead.remove({ leadId }),
    onError,
    onSuccess: async () => {
      toast.success("Lead deleted.");
      await invalidateLeadData(queryClient);
    },
  });

  if (leads.isPending) {
    return (
      <Card>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-9 w-64" />
              <Skeleton className="h-9 w-40" />
              <Skeleton className="h-9 w-40" />
              <Skeleton className="h-9 w-32" />
              <Skeleton className="ml-auto h-9 w-32" />
            </div>
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

  return (
    <Card>
      <CardContent>
        <div className="space-y-4">
          <LeadFilters
            createAction={
              <Button render={<Link to="/admin/leads/new" />}>
                <PlusIcon />
                New lead
              </Button>
            }
            exportAction={
              <ExportButton
                filename="leads"
                onExport={() => api.lead.export(searchParams)}
              />
            }
            viewSwitch={<ViewSwitch onChange={setView} view={view} />}
            hasWebsite={searchParams.hasWebsite}
            onHasWebsiteChange={(hasWebsite) =>
              navigate({
                search: (current) => ({ ...current, page: 1, hasWebsite }),
              })
            }
            onSearch={(search) =>
              navigate({
                search: (current) => ({ ...current, page: 1, search }),
              })
            }
            onSortByChange={(sortBy) =>
              navigate({
                search: (current) => ({ ...current, page: 1, sortBy }),
              })
            }
            onSortOrderChange={(sortOrder) =>
              navigate({
                search: (current) => ({ ...current, page: 1, sortOrder }),
              })
            }
            search={searchParams.search}
            sortBy={searchParams.sortBy ?? "createdAt"}
            sortOrder={searchParams.sortOrder ?? "desc"}
          />
          <SelectionBar
            selection={selection}
            showSelectAll={view === "cards"}
          />
          {view === "cards" ? (
            <LeadCards
              isMutating={remove.isPending}
              leads={leads.data.leads}
              onRemove={(leadId) => remove.mutate(leadId)}
              removingLeadId={remove.variables}
              selection={selection}
            />
          ) : (
            <LeadTable
              isMutating={remove.isPending}
              leads={leads.data.leads}
              onRemove={(leadId) => remove.mutate(leadId)}
              removingLeadId={remove.variables}
              selection={selection}
            />
          )}
          <DataPagination
            currentPage={leads.data.meta.page}
            lastPage={leads.data.meta.lastPage}
            onPageChange={(page) =>
              navigate({ search: (current) => ({ ...current, page }) })
            }
          />
        </div>
      </CardContent>
    </Card>
  );
};

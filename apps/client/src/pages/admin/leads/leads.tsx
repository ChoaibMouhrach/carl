import { api } from "@/api";
import { DataPagination } from "@/components/data-pagination";
import { TableSkeleton } from "@/components/table-skeleton";
import { onError } from "@/lib/base-api";
import { invalidateLeadData } from "@/lib/invalidate";
import { adminLeadsRoute } from "@/routes/admin/leads";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@repo/ui/components/ui/button";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { LeadFilters } from "./lead-filters";
import { LeadTable } from "./lead-table";

export const Leads = () => {
  const { t } = useTranslation();
  const searchParams = adminLeadsRoute.useSearch();
  const navigate = adminLeadsRoute.useNavigate();
  const queryClient = useQueryClient();

  const leads = useQuery({
    queryKey: ["admin", "leads", searchParams],
    queryFn: () => api.lead.list(searchParams),
    placeholderData: (previousData) => previousData,
  });

  const remove = useMutation({
    mutationFn: (leadId: number) => api.lead.remove({ leadId }),
    onError,
    onSuccess: async () => {
      toast.success(t("adminLeads.deleted"));
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
            <TableSkeleton columns={5} />
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
                {t("adminLeads.create")}
              </Button>
            }
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
          <LeadTable
            isMutating={remove.isPending}
            leads={leads.data.leads}
            onRemove={(leadId) => remove.mutate(leadId)}
            removingLeadId={remove.variables}
          />
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

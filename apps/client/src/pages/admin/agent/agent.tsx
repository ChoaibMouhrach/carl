import { api } from "@/api";
import { DataPagination } from "@/components/data-pagination";
import { ApiError, onError } from "@/lib/base-api";
import { adminAgentRoute } from "@/routes/admin/agent";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { toast } from "sonner";
import { AgentHeader } from "./agent-header";
import { RequestSheet } from "./request-sheet";
import { RequestTable } from "./request-table";

export const Agent = () => {
  const { clientId } = adminAgentRoute.useParams();
  const search = adminAgentRoute.useSearch();
  const navigateWithSearch = adminAgentRoute.useNavigate();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const agent = useQuery({
    queryKey: ["admin", "agents", clientId],
    queryFn: () => api.agent.show({ clientId }),
    placeholderData: (previousData) => previousData,
  });

  const requests = useQuery({
    queryKey: ["admin", "agents", clientId, "requests", search.page],
    queryFn: () => api.agent.listRequests({ clientId, page: search.page }),
    placeholderData: (previousData) => previousData,
  });

  const selected = useQuery({
    queryKey: ["admin", "agents", clientId, "request", search.request],
    queryFn: () =>
      api.agent.showRequest({ clientId, requestId: search.request ?? 0 }),
    enabled: search.request !== undefined,
    placeholderData: (previousData) => previousData,
  });

  const remove = useMutation({
    mutationFn: () => api.agent.revoke({ clientId }),
    onError: async (error) => {
      onError(error);

      // Already removed somewhere else, so there is nothing left to show here
      if (error instanceof ApiError && error.statusCode === 404) {
        await navigate({ to: "/admin/account" });
      }
    },
    onSuccess: async () => {
      toast.success("Agent removed.");
      await navigate({ to: "/admin/account" });
      await queryClient.invalidateQueries({ queryKey: ["admin", "agents"] });
    },
  });

  if (agent.isError) throw agent.error;

  return (
    <div className="space-y-6">
      <Link
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
        to="/admin/account"
      >
        <ArrowLeftIcon className="size-4" />
        Account settings
      </Link>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="lg:order-2">
          {agent.isPending ? (
            <Skeleton className="h-[34rem] w-full" />
          ) : (
            <AgentHeader
              agent={agent.data.agent}
              isRemoving={remove.isPending}
              onRemove={() => remove.mutate()}
            />
          )}
        </div>
        <div className="min-w-0 lg:order-1">
          <Card>
            <CardContent>
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Requests</h2>
                <RequestTable
                  onOpen={(requestId) =>
                    navigateWithSearch({
                      search: (current) => ({ ...current, request: requestId }),
                    })
                  }
                  isError={requests.isError && !requests.data}
                  requests={requests.data?.requests}
                  selectedId={search.request}
                />
                <DataPagination
                  currentPage={search.page}
                  // Until the first page arrives the page must not look past the end
                  lastPage={requests.data?.meta.lastPage ?? search.page}
                  onPageChange={(page) =>
                    navigateWithSearch({
                      search: (current) => ({
                        ...current,
                        page,
                        request: undefined,
                      }),
                    })
                  }
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <RequestSheet
        isOpen={search.request !== undefined}
        isError={selected.isError}
        isPending={selected.isPending}
        onClose={() =>
          navigateWithSearch({
            search: (current) => ({ ...current, request: undefined }),
          })
        }
        request={selected.data?.request}
      />
    </div>
  );
};

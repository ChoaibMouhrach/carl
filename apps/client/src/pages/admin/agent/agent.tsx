import { api } from "@/api";
import { DataPagination } from "@/components/data-pagination";
import { onError } from "@/lib/base-api";
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
    onError,
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
      {agent.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <AgentHeader
          agent={agent.data.agent}
          isRemoving={remove.isPending}
          onRemove={() => remove.mutate()}
        />
      )}
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
              requests={requests.data?.requests}
              selectedId={search.request}
            />
            <DataPagination
              currentPage={search.page}
              lastPage={requests.data?.meta.lastPage ?? 1}
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
      <RequestSheet
        isOpen={search.request !== undefined}
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

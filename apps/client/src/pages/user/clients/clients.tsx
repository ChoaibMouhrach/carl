import { api } from "@/api";
import { DataPagination } from "@/components/data-pagination";
import { onError } from "@/lib/base-api";
import { userClientsRoute } from "@/routes/user/clients";
import { useNavigate } from "@tanstack/react-router";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ClientFilters } from "./client-filters";
import { ClientFormSheet } from "./client-form-sheet";
import { ClientTable } from "./client-table";

type Client = Awaited<ReturnType<typeof api.client.list>>["clients"][number];

export const Clients = () => {
  const { t } = useTranslation();
  const searchParams = userClientsRoute.useSearch();
  const navigate = userClientsRoute.useNavigate();
  const appNavigate = useNavigate();
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  const clients = useQuery({
    queryKey: ["clients", searchParams],
    queryFn: () => api.client.list(searchParams),
    placeholderData: (previousData) => previousData,
  });

  const invalidate = async () =>
    await queryClient.invalidateQueries({ queryKey: ["clients"] });

  const closeForm = () => {
    setFormOpen(false);
    setEditingClient(null);
  };

  const create = useMutation({
    mutationFn: (input: { name: string; email: string }) =>
      api.client.create(input),
    onError,
    onSuccess: async () => {
      toast.success(t("clients.created"));
      closeForm();
      await invalidate();
    },
  });

  const update = useMutation({
    mutationFn: (input: { clientId: number; name: string; email: string }) =>
      api.client.update(
        { clientId: input.clientId },
        { name: input.name, email: input.email },
      ),
    onError,
    onSuccess: async () => {
      toast.success(t("clients.updated"));
      closeForm();
      await invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (clientId: number) => api.client.remove({ clientId }),
    onError,
    onSuccess: async () => {
      toast.success(t("clients.removed"));
      await invalidate();
    },
  });

  if (clients.isPending) {
    return <Spinner />;
  }

  if (clients.isError) {
    throw clients.error;
  }

  return (
    <div className="space-y-4">
      <ClientFilters
        onAddClick={() => {
          setEditingClient(null);
          setFormOpen(true);
        }}
        onSearch={(search) =>
          navigate({ search: (current) => ({ ...current, page: 1, search }) })
        }
        search={searchParams.search}
      />

      <Card>
        <CardContent>
          <ClientTable
            clients={clients.data.clients}
            isRemoving={remove.isPending}
            onEdit={(client) => {
              setEditingClient(client);
              setFormOpen(true);
            }}
            onOpen={(client) =>
              appNavigate({
                to: "/user/clients/$clientId/folders",
                params: { clientId: client.clientId.toString() },
                search: { page: 1 },
              })
            }
            onRemove={(clientId) => remove.mutate(clientId)}
            removingClientId={remove.variables}
          />
        </CardContent>
      </Card>

      <DataPagination
        currentPage={clients.data.meta.page}
        lastPage={clients.data.meta.lastPage}
        onPageChange={(page) =>
          navigate({ search: (current) => ({ ...current, page }) })
        }
      />

      <ClientFormSheet
        client={editingClient}
        isPending={create.isPending || update.isPending}
        onOpenChange={(open) => {
          if (!open) closeForm();
        }}
        onSubmit={(values) => {
          if (editingClient) {
            update.mutate({ clientId: editingClient.clientId, ...values });
          } else {
            create.mutate(values);
          }
        }}
        open={formOpen}
      />
    </div>
  );
};

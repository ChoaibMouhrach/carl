import { api } from "@/api";
import { DataPagination } from "@/components/data-pagination";
import { onError } from "@/lib/base-api";
import { userClientFoldersRoute } from "@/routes/user/client-folders";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FolderBreadcrumbs } from "./folder-breadcrumbs";
import { FolderFilters } from "./folder-filters";
import { FolderFormSheet } from "./folder-form-sheet";
import { FolderTable } from "./folder-table";

type Folder = Awaited<ReturnType<typeof api.folder.list>>["folders"][number];

export const ClientFolders = () => {
  const { t } = useTranslation();
  const { clientId } = userClientFoldersRoute.useParams();
  const searchParams = userClientFoldersRoute.useSearch();
  const navigate = userClientFoldersRoute.useNavigate();
  const queryClient = useQueryClient();

  const clientIdNumber = Number(clientId);

  const [formOpen, setFormOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);

  const parentId = searchParams.parentId ?? null;

  const client = useQuery({
    queryKey: ["clients", clientIdNumber],
    queryFn: () => api.client.get({ clientId: clientIdNumber }),
    placeholderData: (previousData) => previousData,
  });

  const folders = useQuery({
    queryKey: ["clients", clientIdNumber, "folders", searchParams],
    queryFn: () => api.folder.list({ clientId: clientIdNumber }, searchParams),
    placeholderData: (previousData) => previousData,
  });

  const path = useQuery({
    queryKey: ["clients", clientIdNumber, "folders", "path", parentId],
    queryFn: () =>
      parentId === null
        ? Promise.resolve({ path: [] })
        : api.folder.getPath({ clientId: clientIdNumber, folderId: parentId }),
    placeholderData: (previousData) => previousData,
  });

  const invalidate = async () =>
    await queryClient.invalidateQueries({
      queryKey: ["clients", clientIdNumber, "folders"],
    });

  const closeForm = () => {
    setFormOpen(false);
    setEditingFolder(null);
  };

  const create = useMutation({
    mutationFn: (input: { name: string }) =>
      api.folder.create({ clientId: clientIdNumber }, { ...input, parentId }),
    onError,
    onSuccess: async () => {
      toast.success(t("clientFolders.created"));
      closeForm();
      await invalidate();
    },
  });

  const update = useMutation({
    mutationFn: (input: { folderId: number; name: string }) =>
      api.folder.update(
        { clientId: clientIdNumber, folderId: input.folderId },
        { name: input.name },
      ),
    onError,
    onSuccess: async () => {
      toast.success(t("clientFolders.updated"));
      closeForm();
      await invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (folderId: number) =>
      api.folder.remove({ clientId: clientIdNumber, folderId }),
    onError,
    onSuccess: async () => {
      toast.success(t("clientFolders.removed"));
      await invalidate();
    },
  });

  if (client.isPending || folders.isPending || path.isPending) {
    return <Spinner />;
  }

  if (client.isError) {
    throw client.error;
  }

  if (folders.isError) {
    throw folders.error;
  }

  if (path.isError) {
    throw path.error;
  }

  const openFolder = (folderId: number | null) =>
    navigate({
      search: (current) => ({
        ...current,
        parentId: folderId ?? undefined,
        page: 1,
        search: undefined,
      }),
    });

  return (
    <div className="space-y-4">
      <FolderBreadcrumbs
        clientName={client.data.name}
        path={path.data.path}
        onNavigate={openFolder}
      />

      <FolderFilters
        onAddClick={() => {
          setEditingFolder(null);
          setFormOpen(true);
        }}
        onSearch={(search) =>
          navigate({ search: (current) => ({ ...current, page: 1, search }) })
        }
        search={searchParams.search}
      />

      <Card>
        <CardContent>
          <FolderTable
            folders={folders.data.folders}
            isRemoving={remove.isPending}
            onEdit={(folder) => {
              setEditingFolder(folder);
              setFormOpen(true);
            }}
            onOpen={(folder) => openFolder(folder.folderId)}
            onRemove={(folderId) => remove.mutate(folderId)}
            removingFolderId={remove.variables}
          />
        </CardContent>
      </Card>

      <DataPagination
        currentPage={folders.data.meta.page}
        lastPage={folders.data.meta.lastPage}
        onPageChange={(page) =>
          navigate({ search: (current) => ({ ...current, page }) })
        }
      />

      <FolderFormSheet
        folder={editingFolder}
        isPending={create.isPending || update.isPending}
        onOpenChange={(open) => {
          if (!open) closeForm();
        }}
        onSubmit={(values) => {
          if (editingFolder) {
            update.mutate({ folderId: editingFolder.folderId, ...values });
          } else {
            create.mutate(values);
          }
        }}
        open={formOpen}
      />
    </div>
  );
};

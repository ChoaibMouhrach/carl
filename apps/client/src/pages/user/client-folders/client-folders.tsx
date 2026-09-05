import { api } from "@/api";
import { DataPagination } from "@/components/data-pagination";
import { TableSkeleton } from "@/components/table-skeleton";
import { onError } from "@/lib/base-api";
import { triggerDownload } from "@/lib/download-file";
import { userClientFoldersRoute } from "@/routes/user/client-folders";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FileRenameSheet } from "./file-rename-sheet";
import { FolderBreadcrumbs } from "./folder-breadcrumbs";
import { FolderEntriesTable } from "./folder-entries-table";
import { FolderFilters } from "./folder-filters";
import { FolderFormSheet } from "./folder-form-sheet";
import { FolderUploadDialog } from "./folder-upload-dialog";

type Entry = Awaited<
  ReturnType<typeof api.folder.listEntries>
>["entries"][number];
type FolderEntry = Extract<Entry, { type: "folder" }>;
type FileEntry = Extract<Entry, { type: "file" }>;

export const ClientFolders = () => {
  const { t } = useTranslation();
  const { clientId } = userClientFoldersRoute.useParams();
  const searchParams = userClientFoldersRoute.useSearch();
  const navigate = userClientFoldersRoute.useNavigate();
  const queryClient = useQueryClient();

  const clientIdNumber = Number(clientId);

  const [formOpen, setFormOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<FolderEntry | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editingFile, setEditingFile] = useState<FileEntry | null>(null);

  const parentId = searchParams.parentId ?? null;

  const client = useQuery({
    queryKey: ["clients", clientIdNumber],
    queryFn: () => api.client.get({ clientId: clientIdNumber }),
    placeholderData: (previousData) => previousData,
  });

  const listing = useQuery({
    queryKey: [
      "clients",
      clientIdNumber,
      "folders",
      parentId,
      "listing",
      searchParams,
    ],
    queryFn: () =>
      api.folder.listEntries(
        { clientId: clientIdNumber, folderId: parentId },
        { page: searchParams.page, search: searchParams.search },
      ),
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

  const invalidateListing = async () =>
    await queryClient.invalidateQueries({
      queryKey: ["clients", clientIdNumber, "folders", parentId, "listing"],
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
      await invalidateListing();
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
      await invalidateListing();
    },
  });

  const remove = useMutation({
    mutationFn: (folderId: number) =>
      api.folder.remove({ clientId: clientIdNumber, folderId }),
    onError,
    onSuccess: async () => {
      toast.success(t("clientFolders.removed"));
      await invalidateListing();
    },
  });

  const renameFile = useMutation({
    mutationFn: (input: { fileId: number; name: string }) =>
      api.file.update(
        { clientId: clientIdNumber, fileId: input.fileId },
        { name: input.name },
      ),
    onError,
    onSuccess: async () => {
      toast.success(t("clientFolders.fileRenamed"));
      setEditingFile(null);
      await invalidateListing();
    },
  });

  const removeFile = useMutation({
    mutationFn: (fileId: number) =>
      api.file.remove({ clientId: clientIdNumber, fileId }),
    onError,
    onSuccess: async () => {
      toast.success(t("clientFolders.fileRemoved"));
      await invalidateListing();
    },
  });

  const downloadFile = useMutation({
    mutationFn: (fileId: number) =>
      api.file.getDownloadUrl({ clientId: clientIdNumber, fileId }),
    onError,
    onSuccess: ({ signedUrl }) => {
      triggerDownload(signedUrl);
    },
  });

  if (client.isPending || listing.isPending || path.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-48" />
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-32" />
        </div>
        <Card>
          <CardContent>
            <TableSkeleton columns={4} />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (client.isError) {
    throw client.error;
  }

  if (listing.isError) {
    throw listing.error;
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
        onUploadClick={() => setUploadOpen(true)}
        onSearch={(search) =>
          navigate({ search: (current) => ({ ...current, page: 1, search }) })
        }
        search={searchParams.search}
      />

      <Card>
        <CardContent>
          <FolderEntriesTable
            entries={listing.data.entries}
            isRemovingFolder={remove.isPending}
            isRemovingFile={removeFile.isPending}
            removingFolderId={remove.variables}
            removingFileId={removeFile.variables}
            onOpenFolder={(folder) => openFolder(folder.folderId)}
            onEditFolder={(folder) => {
              setEditingFolder(folder);
              setFormOpen(true);
            }}
            onRemoveFolder={(folderId) => remove.mutate(folderId)}
            onOpenFile={(file) =>
              window.open(file.url, "_blank", "noopener,noreferrer")
            }
            onEditFile={(file) => setEditingFile(file)}
            onDownloadFile={(file) => downloadFile.mutate(file.fileId)}
            onRemoveFile={(fileId) => removeFile.mutate(fileId)}
          />
        </CardContent>
      </Card>

      <DataPagination
        currentPage={listing.data.meta.page}
        lastPage={listing.data.meta.lastPage}
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

      <FileRenameSheet
        file={editingFile}
        isPending={renameFile.isPending}
        onOpenChange={(open) => {
          if (!open) setEditingFile(null);
        }}
        onSubmit={(values) => {
          if (editingFile) {
            renameFile.mutate({ fileId: editingFile.fileId, ...values });
          }
        }}
      />

      <FolderUploadDialog
        clientId={clientIdNumber}
        folderId={parentId}
        onFilesChanged={invalidateListing}
        onOpenChange={setUploadOpen}
        open={uploadOpen}
      />
    </div>
  );
};

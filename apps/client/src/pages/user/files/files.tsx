import { api } from "@/api";
import { DataPagination } from "@/components/data-pagination";
import { TableSkeleton } from "@/components/table-skeleton";
import { onError } from "@/lib/base-api";
import { triggerDownload } from "@/lib/download-file";
import { userFilesRoute } from "@/routes/user/files";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FileFilters } from "./file-filters";
import { FileRenameSheet } from "./file-rename-sheet";
import { FileTable } from "./file-table";
import { FileUploadDialog } from "./file-upload-dialog";

type FileRecord = Awaited<ReturnType<typeof api.file.list>>["files"][number];

export const Files = () => {
  const { t } = useTranslation();
  const searchParams = userFilesRoute.useSearch();
  const navigate = userFilesRoute.useNavigate();
  const queryClient = useQueryClient();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [editingFile, setEditingFile] = useState<FileRecord | null>(null);

  const files = useQuery({
    queryKey: ["files", searchParams],
    queryFn: () => api.file.list(searchParams),
    placeholderData: (previousData) => previousData,
  });

  const invalidate = async () =>
    await queryClient.invalidateQueries({ queryKey: ["files"] });

  const rename = useMutation({
    mutationFn: (input: { fileId: number; name: string }) =>
      api.file.update({ fileId: input.fileId }, { name: input.name }),
    onError,
    onSuccess: async () => {
      toast.success(t("files.renamed"));
      setEditingFile(null);
      await invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (fileId: number) => api.file.remove({ fileId }),
    onError,
    onSuccess: async () => {
      toast.success(t("files.removed"));
      await invalidate();
    },
  });

  const download = useMutation({
    mutationFn: (fileId: number) => api.file.getDownloadUrl({ fileId }),
    onError,
    onSuccess: ({ signedUrl }) => {
      triggerDownload(signedUrl);
    },
  });

  if (files.isPending) {
    return (
      <div className="space-y-4">
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

  if (files.isError) {
    throw files.error;
  }

  return (
    <div className="space-y-4">
      <FileFilters
        onUploadClick={() => setUploadOpen(true)}
        onSearch={(search) =>
          navigate({ search: (current) => ({ ...current, page: 1, search }) })
        }
        search={searchParams.search}
      />

      <Card>
        <CardContent>
          <FileTable
            files={files.data.files}
            isRemoving={remove.isPending}
            removingFileId={remove.variables}
            onOpen={(file) =>
              window.open(file.url, "_blank", "noopener,noreferrer")
            }
            onEdit={(file) => setEditingFile(file)}
            onDownload={(file) => download.mutate(file.fileId)}
            onRemove={(fileId) => remove.mutate(fileId)}
          />
        </CardContent>
      </Card>

      <DataPagination
        currentPage={files.data.meta.page}
        lastPage={files.data.meta.lastPage}
        onPageChange={(page) =>
          navigate({ search: (current) => ({ ...current, page }) })
        }
      />

      <FileRenameSheet
        file={editingFile}
        isPending={rename.isPending}
        onOpenChange={(open) => {
          if (!open) setEditingFile(null);
        }}
        onSubmit={(values) => {
          if (editingFile) {
            rename.mutate({ fileId: editingFile.fileId, ...values });
          }
        }}
      />

      <FileUploadDialog
        onFilesChanged={invalidate}
        onOpenChange={setUploadOpen}
        open={uploadOpen}
      />
    </div>
  );
};

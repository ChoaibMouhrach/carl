import { api } from "@/api";
import { FileUpload, FileUploadDropzone } from "@/components/file-upload";
import { FileName } from "@/components/file-name";
import { onError } from "@/lib/base-api";
import { uploadFileToFolder, type UploadFileHandle } from "@/lib/upload-file";
import {
  ALLOWED_DOCUMENT_EXTENSIONS,
  MAX_FILE_SIZE_BYTES,
} from "@repo/constants/files";
import { Button } from "@repo/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { Progress } from "@repo/ui/components/ui/progress";
import { ScrollArea } from "@repo/ui/components/ui/scroll-area";
import { useMutation } from "@tanstack/react-query";
import { FileIcon, UploadIcon, XIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const MAX_CONCURRENT_UPLOADS = 3;

interface UploadItem {
  id: string;
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  progress: number;
  fileId?: number;
  error?: string;
  handle?: UploadFileHandle;
}

interface FolderUploadDialogProps {
  clientId: number;
  folderId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFilesChanged?: () => void;
}

const acceptExtensions = ALLOWED_DOCUMENT_EXTENSIONS.map(
  (extension) => `.${extension}`,
).join(",");

export const FolderUploadDialog = ({
  clientId,
  folderId,
  open,
  onOpenChange,
  onFilesChanged,
}: FolderUploadDialogProps) => {
  const { t } = useTranslation();
  const [items, setItems] = useState<UploadItem[]>([]);
  const filesRef = useRef<Map<string, File>>(new Map());
  const queueRef = useRef<string[]>([]);
  const activeCountRef = useRef(0);

  const removeFile = useMutation({
    mutationFn: (fileId: number) => api.file.remove({ clientId, fileId }),
    onError,
    onSuccess: () => onFilesChanged?.(),
  });

  const patchItem = (id: string, patch: Partial<UploadItem>) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const pumpQueue = () => {
    while (
      activeCountRef.current < MAX_CONCURRENT_UPLOADS &&
      queueRef.current.length > 0
    ) {
      const id = queueRef.current.shift();
      if (id) beginUpload(id);
    }
  };

  const beginUpload = (id: string) => {
    const file = filesRef.current.get(id);
    if (!file) return;

    activeCountRef.current += 1;

    const handle = uploadFileToFolder({
      clientId,
      file,
      folderId,
      onProgress: (progress) => patchItem(id, { progress }),
    });

    patchItem(id, { handle, status: "uploading" });

    handle.promise
      .then((uploaded) => {
        patchItem(id, {
          fileId: uploaded.fileId,
          progress: 100,
          status: "done",
        });
        onFilesChanged?.();
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : t("clientFolders.uploadFailed");

        patchItem(id, { error: message, status: "error" });
      })
      .finally(() => {
        activeCountRef.current -= 1;
        filesRef.current.delete(id);
        pumpQueue();
      });
  };

  const handleFilesAdded = (files: File[]) => {
    const newItems: UploadItem[] = files.map((file) => {
      const id = crypto.randomUUID();
      filesRef.current.set(id, file);
      return { file, id, progress: 0, status: "pending" };
    });

    setItems((current) => [...current, ...newItems]);
    queueRef.current.push(...newItems.map((item) => item.id));
    pumpQueue();
  };

  const handleRemove = (item: UploadItem) => {
    if (item.status === "uploading") {
      item.handle?.abort();
    } else if (item.status === "pending") {
      queueRef.current = queueRef.current.filter((id) => id !== item.id);
    } else if (item.status === "done" && item.fileId) {
      removeFile.mutate(item.fileId);
    }

    filesRef.current.delete(item.id);
    setItems((current) => current.filter((entry) => entry.id !== item.id));
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      for (const item of items) {
        if (item.status === "uploading") item.handle?.abort();
      }
      queueRef.current = [];
      activeCountRef.current = 0;
      filesRef.current.clear();
      setItems([]);
    }

    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex h-[90vh] w-full flex-col overflow-hidden sm:h-[85vh] sm:max-w-[calc(100%-4rem)]">
        <DialogHeader>
          <DialogTitle>{t("clientFolders.uploadTitle")}</DialogTitle>
          <DialogDescription>
            {t("clientFolders.uploadDescription")}
          </DialogDescription>
        </DialogHeader>

        <FileUpload
          multiple
          accept={acceptExtensions}
          maxSize={MAX_FILE_SIZE_BYTES}
          value={[]}
          onUpload={async (files) => handleFilesAdded(files)}
          className="min-h-0 min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-stretch"
        >
          <FileUploadDropzone className="flex flex-1 flex-col items-center justify-center gap-2 p-6 transition-all sm:p-8">
            <div className="flex items-center justify-center rounded-full border bg-background p-2.5 shadow-xs">
              <UploadIcon className="size-5 text-muted-foreground" />
            </div>
            <div className="flex flex-col items-center gap-0.5 text-center">
              <p className="text-sm font-medium">
                {t("clientFolders.dropHint")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("clientFolders.dropAccept")}
              </p>
            </div>
          </FileUploadDropzone>

          {items.length > 0 && (
            <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-hidden sm:w-80 sm:flex-none">
              <ScrollArea className="min-w-0 flex-1 rounded-lg border">
                <div
                  role="list"
                  aria-label={t("clientFolders.uploadListLabel")}
                  className="flex w-1 min-w-full flex-col gap-2 p-2"
                >
                  {items.map((item) => (
                    <UploadListItem
                      key={item.id}
                      item={item}
                      onRemove={() => handleRemove(item)}
                    />
                  ))}
                </div>
              </ScrollArea>

              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                {t("clientFolders.done")}
              </Button>
            </div>
          )}
        </FileUpload>
      </DialogContent>
    </Dialog>
  );
};

const UploadListItem = ({
  item,
  onRemove,
}: {
  item: UploadItem;
  onRemove: () => void;
}) => {
  const { t } = useTranslation();

  return (
    <div
      role="listitem"
      className="flex items-center gap-2.5 overflow-hidden rounded-md border p-3"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded border bg-accent/50 text-muted-foreground">
        <FileIcon className="size-5" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <FileName name={item.file.name} className="text-sm font-medium" />
        {item.status === "error" ? (
          <span className="text-xs text-destructive">{item.error}</span>
        ) : item.status === "pending" ? (
          <span className="text-xs text-muted-foreground">
            {t("clientFolders.uploadQueued")}
          </span>
        ) : (
          <Progress value={item.status === "done" ? 100 : item.progress} />
        )}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onRemove}
        className="text-muted-foreground hover:text-foreground"
      >
        <XIcon />
        <span className="sr-only">
          {t("clientFolders.removeUpload", { name: item.file.name })}
        </span>
      </Button>
    </div>
  );
};

import { api } from "@/api";
import { FileName } from "@/components/file-name";
import { formatBytes } from "@/lib/format-bytes";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/ui/alert-dialog";
import { Button } from "@repo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { Spinner } from "@repo/ui/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { FileIcon, FolderIcon, MoreHorizontalIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

type Entry = Awaited<
  ReturnType<typeof api.folder.listEntries>
>["entries"][number];
type FolderEntry = Extract<Entry, { type: "folder" }>;
type FileEntry = Extract<Entry, { type: "file" }>;

interface FolderEntriesTableProps {
  entries: Entry[];
  isRemovingFolder: boolean;
  isRemovingFile: boolean;
  removingFolderId?: number;
  removingFileId?: number;
  onOpenFolder: (folder: FolderEntry) => void;
  onEditFolder: (folder: FolderEntry) => void;
  onRemoveFolder: (folderId: number) => void;
  onOpenFile: (file: FileEntry) => void;
  onEditFile: (file: FileEntry) => void;
  onDownloadFile: (file: FileEntry) => void;
  onRemoveFile: (fileId: number) => void;
}

export const FolderEntriesTable = ({
  entries,
  isRemovingFolder,
  isRemovingFile,
  removingFolderId,
  removingFileId,
  onOpenFolder,
  onEditFolder,
  onRemoveFolder,
  onOpenFile,
  onEditFile,
  onDownloadFile,
  onRemoveFile,
}: FolderEntriesTableProps) => {
  const { t } = useTranslation();
  const [removeTarget, setRemoveTarget] = useState<Entry | null>(null);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("clientFolders.name")}</TableHead>
            <TableHead>{t("clientFolders.size")}</TableHead>
            <TableHead>{t("clientFolders.createdAt")}</TableHead>
            <TableHead>
              <span className="sr-only">{t("clientFolders.actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4}>
                {t("clientFolders.entriesEmpty")}
              </TableCell>
            </TableRow>
          ) : (
            entries.map((entry) => {
              const isFolder = entry.type === "folder";
              const isPending = isFolder
                ? isRemovingFolder && removingFolderId === entry.folderId
                : isRemovingFile && removingFileId === entry.fileId;

              return (
                <TableRow
                  key={`${entry.type}-${isFolder ? entry.folderId : entry.fileId}`}
                  className="cursor-pointer"
                  onClick={() =>
                    isFolder ? onOpenFolder(entry) : onOpenFile(entry)
                  }
                >
                  <TableCell>
                    <div className="flex w-64 min-w-0 items-center gap-2">
                      {isFolder ? (
                        <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      {isFolder ? (
                        <span title={entry.name} className="truncate">
                          {entry.name}
                        </span>
                      ) : (
                        <FileName name={entry.name} />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {isFolder
                      ? formatBytes(entry.totalSizeBytes)
                      : formatBytes(entry.sizeBytes)}
                  </TableCell>
                  <TableCell>
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          aria-label={t("clientFolders.actions")}
                          disabled={isPending}
                          size="icon"
                          variant="ghost"
                        >
                          {isPending ? <Spinner /> : <MoreHorizontalIcon />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            isFolder ? onEditFolder(entry) : onEditFile(entry)
                          }
                        >
                          {t("clientFolders.edit")}
                        </DropdownMenuItem>
                        {!isFolder && (
                          <DropdownMenuItem
                            onClick={() => onDownloadFile(entry)}
                          >
                            {t("clientFolders.download")}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => setRemoveTarget(entry)}
                        >
                          {t("clientFolders.remove")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {removeTarget?.type === "folder"
                ? t("clientFolders.removeTitle")
                : t("clientFolders.removeFileTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget?.type === "folder"
                ? t("clientFolders.removeDescription")
                : t("clientFolders.removeFileDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("clientFolders.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!removeTarget) return;
                if (removeTarget.type === "folder") {
                  onRemoveFolder(removeTarget.folderId);
                } else {
                  onRemoveFile(removeTarget.fileId);
                }
              }}
            >
              {t("clientFolders.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

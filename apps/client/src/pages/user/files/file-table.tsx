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
import { FileIcon, MoreHorizontalIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

type FileRecord = Awaited<ReturnType<typeof api.file.list>>["files"][number];

interface FileTableProps {
  files: FileRecord[];
  isRemoving: boolean;
  removingFileId?: number;
  onOpen: (file: FileRecord) => void;
  onEdit: (file: FileRecord) => void;
  onDownload: (file: FileRecord) => void;
  onRemove: (fileId: number) => void;
}

export const FileTable = ({
  files,
  isRemoving,
  removingFileId,
  onOpen,
  onEdit,
  onDownload,
  onRemove,
}: FileTableProps) => {
  const { t } = useTranslation();
  const [removeTarget, setRemoveTarget] = useState<FileRecord | null>(null);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("files.name")}</TableHead>
            <TableHead>{t("files.size")}</TableHead>
            <TableHead>{t("files.createdAt")}</TableHead>
            <TableHead>
              <span className="sr-only">{t("files.actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {files.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4}>{t("files.empty")}</TableCell>
            </TableRow>
          ) : (
            files.map((file) => {
              const isPending = isRemoving && removingFileId === file.fileId;

              return (
                <TableRow
                  key={file.fileId}
                  className="cursor-pointer"
                  onClick={() => onOpen(file)}
                >
                  <TableCell>
                    <div className="flex w-64 min-w-0 items-center gap-2">
                      <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                      <FileName name={file.name} />
                    </div>
                  </TableCell>
                  <TableCell>{formatBytes(file.sizeBytes)}</TableCell>
                  <TableCell>
                    {new Date(file.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          aria-label={t("files.actions")}
                          disabled={isPending}
                          size="icon"
                          variant="ghost"
                        >
                          {isPending ? <Spinner /> : <MoreHorizontalIcon />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(file)}>
                          {t("files.edit")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onDownload(file)}>
                          {t("files.download")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setRemoveTarget(file)}>
                          {t("files.remove")}
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
            <AlertDialogTitle>{t("files.removeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("files.removeDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("files.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removeTarget) onRemove(removeTarget.fileId);
              }}
            >
              {t("files.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

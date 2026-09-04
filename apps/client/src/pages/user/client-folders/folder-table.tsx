import { api } from "@/api";
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
import { FolderIcon, MoreHorizontalIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

type Folder = Awaited<ReturnType<typeof api.folder.list>>["folders"][number];

interface FolderTableProps {
  folders: Folder[];
  isRemoving: boolean;
  onEdit: (folder: Folder) => void;
  onOpen: (folder: Folder) => void;
  onRemove: (folderId: number) => void;
  removingFolderId?: number;
}

export const FolderTable = ({
  folders,
  isRemoving,
  onEdit,
  onOpen,
  onRemove,
  removingFolderId,
}: FolderTableProps) => {
  const { t } = useTranslation();
  const [removeTarget, setRemoveTarget] = useState<Folder | null>(null);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("clientFolders.name")}</TableHead>
            <TableHead>{t("clientFolders.createdAt")}</TableHead>
            <TableHead>
              <span className="sr-only">{t("clientFolders.actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {folders.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3}>{t("clientFolders.empty")}</TableCell>
            </TableRow>
          ) : (
            folders.map((folder) => {
              const isPending =
                isRemoving && removingFolderId === folder.folderId;

              return (
                <TableRow
                  key={folder.folderId}
                  className="cursor-pointer"
                  onClick={() => onOpen(folder)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FolderIcon className="size-4 text-muted-foreground" />
                      {folder.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    {new Date(folder.createdAt).toLocaleDateString()}
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
                        <DropdownMenuItem onClick={() => onEdit(folder)}>
                          {t("clientFolders.edit")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setRemoveTarget(folder)}
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
              {t("clientFolders.removeTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("clientFolders.removeDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("clientFolders.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removeTarget) onRemove(removeTarget.folderId);
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

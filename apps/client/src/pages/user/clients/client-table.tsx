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
import { MoreHorizontalIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

type Client = Awaited<ReturnType<typeof api.client.list>>["clients"][number];

interface ClientTableProps {
  clients: Client[];
  isRemoving: boolean;
  onEdit: (client: Client) => void;
  onRemove: (clientId: number) => void;
  onOpen: (client: Client) => void;
  removingClientId?: number;
}

export const ClientTable = ({
  clients,
  isRemoving,
  onEdit,
  onRemove,
  onOpen,
  removingClientId,
}: ClientTableProps) => {
  const { t } = useTranslation();
  const [removeTarget, setRemoveTarget] = useState<Client | null>(null);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("clients.name")}</TableHead>
            <TableHead>{t("clients.email")}</TableHead>
            <TableHead>
              <span className="sr-only">{t("clients.actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3}>{t("clients.empty")}</TableCell>
            </TableRow>
          ) : (
            clients.map((client) => {
              const isPending =
                isRemoving && removingClientId === client.clientId;

              return (
                <TableRow
                  key={client.clientId}
                  className="cursor-pointer"
                  onClick={() => onOpen(client)}
                >
                  <TableCell>{client.name}</TableCell>
                  <TableCell>{client.email}</TableCell>
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          aria-label={t("clients.actions")}
                          disabled={isPending}
                          size="icon"
                          variant="ghost"
                        >
                          {isPending ? <Spinner /> : <MoreHorizontalIcon />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(client)}>
                          {t("clients.edit")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setRemoveTarget(client)}
                        >
                          {t("clients.remove")}
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
            <AlertDialogTitle>{t("clients.removeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("clients.removeDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("clients.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removeTarget) onRemove(removeTarget.clientId);
              }}
            >
              {t("clients.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

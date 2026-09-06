import { api } from "@/api";
import { env } from "@/config/env";
import { ListSkeleton } from "@/components/list-skeleton";
import { onError } from "@/lib/base-api";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/ui/alert-dialog";
import { Button } from "@repo/ui/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@repo/ui/components/ui/input-group";
import { Spinner } from "@repo/ui/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@repo/ui/components/ui/tooltip";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, CircleHelpIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const formatDate = (value: Date | string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const endpointUrl = `${env.VITE_API_URL}/mcp`;

export const McpConnections = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [clientIdToRevoke, setClientIdToRevoke] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const connections = useQuery({
    queryKey: ["mcp", "connections"],
    queryFn: () => api.mcp.listConnections(),
    placeholderData: (previousData) => previousData,
  });

  const revokeConnection = useMutation({
    mutationFn: (clientId: string) => api.mcp.revokeConnection(clientId),
    onError: (error) => {
      setClientIdToRevoke(null);
      onError(error);
    },
    onSuccess: async () => {
      setClientIdToRevoke(null);
      toast.success(t("settings.mcpConnections.revokedToast"));
      await queryClient.invalidateQueries({
        queryKey: ["mcp", "connections"],
      });
    },
  });

  const copyEndpoint = async () => {
    await navigator.clipboard.writeText(endpointUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (connections.isPending) return <ListSkeleton />;
  if (connections.isError) throw connections.error;

  return (
    <>
      <div className="space-y-4 rounded-lg border p-4">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium">
            {t("settings.mcpConnections.endpointLabel")}
          </p>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  aria-label={t("settings.mcpConnections.howTo.title")}
                  className="text-muted-foreground"
                  type="button"
                >
                  <CircleHelpIcon className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <ol className="list-decimal space-y-1 pl-3.5">
                  <li>{t("settings.mcpConnections.howTo.step1")}</li>
                  <li>{t("settings.mcpConnections.howTo.step2")}</li>
                  <li>{t("settings.mcpConnections.howTo.step3")}</li>
                  <li>{t("settings.mcpConnections.howTo.step4")}</li>
                </ol>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <InputGroup>
          <InputGroupInput readOnly value={endpointUrl} />
          <InputGroupAddon align="inline-end">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <InputGroupButton
                    aria-label={t("settings.mcpConnections.copy")}
                    onClick={copyEndpoint}
                    size="icon-xs"
                  >
                    {copied ? <CheckIcon /> : <CopyIcon />}
                  </InputGroupButton>
                </TooltipTrigger>
                <TooltipContent>
                  {copied
                    ? t("settings.mcpConnections.copied")
                    : t("settings.mcpConnections.copy")}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </InputGroupAddon>
        </InputGroup>
      </div>

      {connections.data.connections.length === 0 ? (
        <p className="text-muted-foreground mt-4 text-sm">
          {t("settings.mcpConnections.empty")}
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {connections.data.connections.map((connection) => (
            <div
              className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between"
              key={connection.clientId}
            >
              <div className="min-w-0 space-y-1">
                <p className="font-medium">{connection.name}</p>
                <p className="text-muted-foreground text-sm">
                  {t("settings.mcpConnections.connectedAt", {
                    date: formatDate(connection.connectedAt),
                  })}
                </p>
                <p className="text-muted-foreground text-sm">
                  {t("settings.mcpConnections.lastUsedAt", {
                    date: formatDate(connection.lastUsedAt),
                  })}
                </p>
              </div>
              <Button
                disabled={revokeConnection.isPending}
                onClick={() => setClientIdToRevoke(connection.clientId)}
                variant="outline"
              >
                {revokeConnection.isPending &&
                  revokeConnection.variables === connection.clientId && (
                    <Spinner />
                  )}
                {t("settings.mcpConnections.revoke")}
              </Button>
            </div>
          ))}
        </div>
      )}

      <AlertDialog
        open={clientIdToRevoke !== null}
        onOpenChange={(open) => {
          if (!open && !revokeConnection.isPending) setClientIdToRevoke(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.mcpConnections.dialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.mcpConnections.dialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              disabled={revokeConnection.isPending}
              onClick={() => setClientIdToRevoke(null)}
              variant="outline"
            >
              {t("settings.mcpConnections.dialog.cancel")}
            </Button>
            <Button
              disabled={revokeConnection.isPending}
              onClick={() =>
                clientIdToRevoke && revokeConnection.mutate(clientIdToRevoke)
              }
            >
              {revokeConnection.isPending && <Spinner />}
              {t("settings.mcpConnections.dialog.confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

import { api } from "@/api";
import { env } from "@/config/env";
import { onError } from "@/lib/base-api";
import { Field, FieldLabel } from "@repo/ui/components/ui/field";
import { Input } from "@repo/ui/components/ui/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AgentList } from "./agent-list";
import { CopyButton } from "./copy-button";

const mcpUrl = `${env.VITE_API_URL.replace(/\/$/, "")}/api/mcp`;

export const AgentAccess = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const agents = useQuery({
    queryKey: ["admin", "agents"],
    queryFn: () => api.agent.list(),
    placeholderData: (previousData) => previousData,
  });

  const revoke = useMutation({
    mutationFn: (clientId: string) => api.agent.revoke({ clientId }),
    onError,
    onSuccess: async () => {
      toast.success(t("settings.agents.revoked"));
      await queryClient.invalidateQueries({ queryKey: ["admin", "agents"] });
    },
  });

  if (agents.isError) throw agents.error;

  return (
    <div className="space-y-6">
      <Field>
        <FieldLabel htmlFor="mcp-url">
          {t("settings.agents.urlLabel")}
        </FieldLabel>
        <div className="flex gap-2">
          <Input id="mcp-url" readOnly value={mcpUrl} />
          <CopyButton value={mcpUrl} />
        </div>
      </Field>
      <AgentList
        agents={agents.data?.agents}
        isRevoking={revoke.isPending}
        onRevoke={(clientId) => revoke.mutate(clientId)}
        revokingClientId={revoke.isPending ? revoke.variables : undefined}
      />
    </div>
  );
};

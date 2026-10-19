import { api } from "@/api";
import { env } from "@/config/env";
import { onError } from "@/lib/base-api";
import { Button } from "@repo/ui/components/ui/button";
import { Field, FieldLabel } from "@repo/ui/components/ui/field";
import { Input } from "@repo/ui/components/ui/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { toast } from "sonner";
import { AgentList } from "./agent-list";
import { CopyButton } from "@/components/copy-button";

const mcpUrl = `${env.VITE_API_URL.replace(/\/$/, "")}/api/mcp`;

export const AgentAccess = () => {
  const queryClient = useQueryClient();

  const agents = useQuery({
    queryKey: ["admin", "agents"],
    queryFn: () => api.agent.list(),
    placeholderData: (previousData) => previousData,
  });

  // Query notifications are batched, so two quick clicks can both see "not pending"
  const isRevoking = useRef(false);

  const revoke = useMutation({
    mutationFn: (clientId: string) => api.agent.revoke({ clientId }),
    onError,
    onSuccess: () => toast.success("Agent removed."),
    // Also after a failure: the agent may already have been removed elsewhere
    onSettled: async () => {
      isRevoking.current = false;
      await queryClient.invalidateQueries({ queryKey: ["admin", "agents"] });
    },
  });

  return (
    <div className="space-y-6">
      <Field>
        <FieldLabel htmlFor="mcp-url">MCP server address</FieldLabel>
        <div className="flex gap-2">
          <Input id="mcp-url" readOnly value={mcpUrl} />
          <CopyButton value={mcpUrl} />
        </div>
      </Field>
      {agents.isError && !agents.data ? (
        <div className="space-y-3">
          <p className="text-sm text-destructive">
            Could not load the connected agents.
          </p>
          <Button
            onClick={() => agents.refetch()}
            type="button"
            variant="outline"
          >
            Try again
          </Button>
        </div>
      ) : (
        <AgentList
          agents={agents.data?.agents}
          isRevoking={revoke.isPending}
          onRevoke={(clientId) => {
            if (isRevoking.current) return;

            isRevoking.current = true;
            revoke.mutate(clientId);
          }}
          revokingClientId={revoke.isPending ? revoke.variables : undefined}
        />
      )}
    </div>
  );
};

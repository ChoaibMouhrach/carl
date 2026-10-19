import type { Agent } from "@/api/agent";
import { CardFacts } from "@/components/card-facts";
import { CardGrid, CardGridSkeleton } from "@/components/card-grid";
import { CardFrame } from "@/components/card-frame";
import { CardIdentity } from "@/components/card-identity";
import { RowActions } from "@/components/row-actions";
import { formatDate } from "@/lib/format";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
} from "@repo/ui/components/ui/card";
import { useNavigate } from "@tanstack/react-router";
import { BotIcon, CalendarIcon } from "lucide-react";

interface AgentListProps {
  agents?: Agent[];
  isRevoking: boolean;
  onRevoke: (clientId: string) => void;
  revokingClientId?: string;
}

export const AgentList = ({
  agents,
  isRevoking,
  onRevoke,
  revokingClientId,
}: AgentListProps) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">Connected agents</h3>
      {!agents ? (
        <CardGridSkeleton count={2} />
      ) : agents.length === 0 ? (
        <p className="text-muted-foreground">No agents connected yet.</p>
      ) : (
        <CardGrid>
          {agents.map((agent) => (
            <CardFrame
              key={agent.clientId}
              onClick={() =>
                navigate({
                  to: "/admin/agents/$clientId",
                  params: { clientId: agent.clientId },
                  search: { page: 1 },
                })
              }
            >
              <Card>
                <CardHeader>
                  <CardIdentity
                    avatar={<BotIcon />}
                    description={agent.userEmail ?? "Unknown"}
                    title={agent.name}
                  />
                  <CardAction>
                    <RowActions
                      cancelLabel="Cancel"
                      deleteDescription="The agent is signed out right away and has to sign in again to come back."
                      deleteLabel="Remove agent"
                      deleteTitle="Remove this agent?"
                      isDeleting={
                        isRevoking && revokingClientId === agent.clientId
                      }
                      isDisabled={isRevoking}
                      menuLabel="Agent actions"
                      onDelete={() => onRevoke(agent.clientId)}
                    />
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <CardFacts
                    facts={[
                      {
                        icon: CalendarIcon,
                        label: "Connected",
                        value: formatDate(agent.connectedAt),
                      },
                    ]}
                  />
                </CardContent>
              </Card>
            </CardFrame>
          ))}
        </CardGrid>
      )}
    </div>
  );
};

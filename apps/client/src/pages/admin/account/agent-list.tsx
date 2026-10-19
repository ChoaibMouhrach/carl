import type { Agent } from "@/api/agent";
import { CardFacts } from "@/components/card-facts";
import { CardGrid, CardGridSkeleton } from "@/components/card-grid";
import { CardIdentity } from "@/components/card-identity";
import { RowActions } from "@/components/row-actions";
import { formatDate } from "@/lib/format";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
} from "@repo/ui/components/ui/card";
import { BotIcon, CalendarIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">
        {t("settings.agents.connectedTitle")}
      </h3>
      {!agents ? (
        <CardGridSkeleton count={2} />
      ) : agents.length === 0 ? (
        <p className="text-muted-foreground">{t("settings.agents.empty")}</p>
      ) : (
        <CardGrid>
          {agents.map((agent) => (
            <Card key={agent.clientId}>
              <CardHeader>
                <CardIdentity
                  avatar={<BotIcon />}
                  description={
                    agent.userEmail ?? t("settings.agents.unknownUser")
                  }
                  title={agent.name}
                />
                <CardAction>
                  <RowActions
                    cancelLabel={t("settings.agents.cancel")}
                    deleteDescription={t("settings.agents.revokeDescription")}
                    deleteLabel={t("settings.agents.revoke")}
                    deleteTitle={t("settings.agents.revokeTitle")}
                    isDeleting={
                      isRevoking && revokingClientId === agent.clientId
                    }
                    isDisabled={isRevoking}
                    menuLabel={t("settings.agents.menu")}
                    onDelete={() => onRevoke(agent.clientId)}
                  />
                </CardAction>
              </CardHeader>
              <CardContent>
                <CardFacts
                  facts={[
                    {
                      icon: CalendarIcon,
                      label: t("settings.agents.connectedAt"),
                      value: formatDate(agent.connectedAt),
                    },
                  ]}
                />
              </CardContent>
            </Card>
          ))}
        </CardGrid>
      )}
    </div>
  );
};

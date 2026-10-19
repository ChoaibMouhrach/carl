import type { AgentDetail } from "@/api/agent";
import { CardFacts } from "@/components/card-facts";
import { CardIdentity } from "@/components/card-identity";
import { CopyButton } from "@/components/copy-button";
import { formatNumber } from "@/lib/format";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/ui/components/ui/alert-dialog";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
} from "@repo/ui/components/ui/card";
import { Separator } from "@repo/ui/components/ui/separator";
import { Spinner } from "@repo/ui/components/ui/spinner";
import {
  AlertTriangleIcon,
  BotIcon,
  CalendarIcon,
  ClockIcon,
  ListIcon,
  Trash2Icon,
} from "lucide-react";
import { formatDateTime } from "./format";

interface AgentHeaderProps {
  agent: AgentDetail;
  isRemoving: boolean;
  onRemove: () => void;
}

export const AgentHeader = ({
  agent,
  isRemoving,
  onRemove,
}: AgentHeaderProps) => (
  <Card>
    <CardHeader>
      <CardIdentity
        avatar={<BotIcon />}
        description={
          agent.userEmail ? `Connected by ${agent.userEmail}` : "Connected"
        }
        title={agent.name}
      />
      <CardAction>
        <AlertDialog>
          <AlertDialogTrigger
            render={<Button disabled={isRemoving} variant="outline" />}
          >
            {isRemoving ? <Spinner /> : <Trash2Icon />}
            Remove agent
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove this agent?</AlertDialogTitle>
              <AlertDialogDescription>
                The agent is signed out right away and its request history is
                deleted. It has to sign in again to come back.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onRemove} variant="destructive">
                Remove agent
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardAction>
    </CardHeader>
    <CardContent>
      <div className="space-y-5">
        <Separator />
        <CardFacts
          facts={[
            {
              icon: CalendarIcon,
              label: "Connected",
              value: formatDateTime(agent.connectedAt),
            },
            {
              icon: ClockIcon,
              label: "Last active",
              value: formatDateTime(agent.lastActiveAt),
            },
            {
              icon: ListIcon,
              label: "Requests",
              value: formatNumber(agent.requestCount),
            },
            {
              icon: AlertTriangleIcon,
              label: "Errors",
              value:
                agent.errorCount > 0 ? (
                  <Badge variant="destructive">
                    {formatNumber(agent.errorCount)}
                  </Badge>
                ) : (
                  "None"
                ),
            },
          ]}
        />
        <dl className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <dt className="text-muted-foreground">Client ID</dt>
              <dd className="truncate font-mono text-xs">{agent.clientId}</dd>
            </div>
            <CopyButton size="sm" value={agent.clientId} />
          </div>
          <div>
            <dt className="text-muted-foreground">Redirect addresses</dt>
            {agent.redirectUrls.map((url) => (
              <dd className="break-all font-mono text-xs" key={url}>
                {url}
              </dd>
            ))}
          </div>
        </dl>
      </div>
    </CardContent>
  </Card>
);

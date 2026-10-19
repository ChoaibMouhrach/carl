import type { AgentDetail } from "@/api/agent";
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
import { Button } from "@repo/ui/components/ui/button";
import { Card, CardContent, CardHeader } from "@repo/ui/components/ui/card";
import { Separator } from "@repo/ui/components/ui/separator";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { BotIcon, Trash2Icon } from "lucide-react";
import { formatDateTime } from "./format";

interface AgentHeaderProps {
  agent: AgentDetail;
  isRemoving: boolean;
  onRemove: () => void;
}

const Stat = ({
  label,
  tone,
  value,
}: {
  label: string;
  tone?: "danger";
  value: string;
}) => (
  <div className="rounded-lg border p-3">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div
      className={`text-2xl font-semibold tabular-nums ${tone === "danger" ? "text-destructive" : ""}`}
    >
      {value}
    </div>
  </div>
);

const Detail = ({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) => (
  <div className="space-y-1">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="text-sm">{children}</dd>
  </div>
);

export const AgentHeader = ({
  agent,
  isRemoving,
  onRemove,
}: AgentHeaderProps) => (
  <Card>
    <CardHeader>
      <CardIdentity
        avatar={<BotIcon />}
        description={agent.userEmail ?? "Connected"}
        title={agent.name}
      />
    </CardHeader>
    <CardContent>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Requests" value={formatNumber(agent.requestCount)} />
          <Stat
            label="Errors"
            tone={agent.errorCount > 0 ? "danger" : undefined}
            value={formatNumber(agent.errorCount)}
          />
        </div>
        <Separator />
        <dl className="space-y-4">
          <Detail label="Connected">{formatDateTime(agent.connectedAt)}</Detail>
          <Detail label="Last active">
            {formatDateTime(agent.lastActiveAt)}
          </Detail>
          <Detail label="Client ID">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 break-all font-mono text-xs">
                {agent.clientId}
              </span>
              <CopyButton label="Copy client ID" value={agent.clientId} />
            </div>
          </Detail>
          <Detail label="Redirect addresses">
            <ul className="space-y-1">
              {agent.redirectUrls.map((url) => (
                <li className="break-all font-mono text-xs" key={url}>
                  {url}
                </li>
              ))}
            </ul>
          </Detail>
        </dl>
        <Separator />
        <div className="flex flex-col">
          <AlertDialog>
            <AlertDialogTrigger
              render={<Button disabled={isRemoving} variant="destructive" />}
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
        </div>
      </div>
    </CardContent>
  </Card>
);

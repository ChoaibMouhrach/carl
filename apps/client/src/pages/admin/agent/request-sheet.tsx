import type { AgentRequestDetail } from "@/api/agent";
import { Badge } from "@repo/ui/components/ui/badge";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/ui/sheet";
import { CodeBlock } from "./code-block";
import { formatDateTime } from "./format";

interface RequestSheetProps {
  isPending: boolean;
  isOpen: boolean;
  onClose: () => void;
  request?: AgentRequestDetail;
}

export const RequestSheet = ({
  isPending,
  isOpen,
  onClose,
  request,
}: RequestSheetProps) => (
  <Sheet onOpenChange={(open) => !open && onClose()} open={isOpen}>
    <SheetContent size="wide">
      <SheetHeader>
        <SheetTitle>
          {request
            ? `${request.rpcMethod}${request.toolName ? ` · ${request.toolName}` : ""}`
            : "Request"}
        </SheetTitle>
        <SheetDescription>
          {request
            ? `${formatDateTime(request.createdAt)} · ${request.durationMs} ms`
            : "Loading the request."}
        </SheetDescription>
        {request && (
          <div className="flex gap-2">
            <Badge variant={request.isError ? "destructive" : "outline"}>
              {request.isError ? "Error" : "OK"}
            </Badge>
            <Badge variant="secondary">HTTP {request.statusCode}</Badge>
          </div>
        )}
      </SheetHeader>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pb-6">
        {isPending || !request ? (
          <>
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-64 w-full" />
          </>
        ) : (
          <>
            <CodeBlock title="Request" value={request.requestBody} />
            <CodeBlock title="Response" value={request.responseBody} />
          </>
        )}
      </div>
    </SheetContent>
  </Sheet>
);

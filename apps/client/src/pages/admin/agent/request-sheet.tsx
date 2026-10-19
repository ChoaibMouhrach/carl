import type { AgentRequestDetail } from "@/api/agent";
import { Badge } from "@repo/ui/components/ui/badge";
import { ScrollArea } from "@repo/ui/components/ui/scroll-area";
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
  isError: boolean;
  isPending: boolean;
  isOpen: boolean;
  onClose: () => void;
  request?: AgentRequestDetail;
}

export const RequestSheet = ({
  isError,
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
            : isError
              ? "This request is not available."
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
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-6 px-4 pb-6">
          {isError && !request ? (
            <p className="text-sm text-destructive">Request not found.</p>
          ) : isPending || !request ? (
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
      </ScrollArea>
    </SheetContent>
  </Sheet>
);

import type { AgentRequestSummary } from "@/api/agent";
import { TableSkeleton } from "@/components/table-skeleton";
import { Badge } from "@repo/ui/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { formatDateTime } from "./format";

interface RequestTableProps {
  onOpen: (requestId: number) => void;
  requests?: AgentRequestSummary[];
  selectedId?: number;
}

export const RequestTable = ({
  onOpen,
  requests,
  selectedId,
}: RequestTableProps) => {
  if (!requests) return <TableSkeleton columns={5} />;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Method</TableHead>
          <TableHead>Tool</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Duration</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5}>
              This agent has not made any requests yet.
            </TableCell>
          </TableRow>
        ) : (
          requests.map((request) => (
            <TableRow
              className="cursor-pointer"
              data-state={
                request.mcpRequestId === selectedId ? "selected" : undefined
              }
              key={request.mcpRequestId}
              onClick={() => onOpen(request.mcpRequestId)}
            >
              <TableCell className="whitespace-nowrap">
                {formatDateTime(request.createdAt)}
              </TableCell>
              <TableCell className="font-mono text-xs">
                {request.rpcMethod}
              </TableCell>
              <TableCell className="font-mono text-xs">
                {request.toolName ?? "—"}
              </TableCell>
              <TableCell>
                <Badge variant={request.isError ? "destructive" : "outline"}>
                  {request.isError ? "Error" : "OK"}
                </Badge>
              </TableCell>
              <TableCell>{request.durationMs} ms</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
};

import { api } from "@/api";
import { EmailLink, ExternalLink } from "@/components/external-link";
import { ListPagination } from "@/components/list-pagination";
import { formatNumber } from "@/lib/format";
import type { PageSize } from "@repo/constants/pagination";
import { Badge } from "@repo/ui/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { Link, useNavigate } from "@tanstack/react-router";
import { UsersIcon } from "lucide-react";

type LeadList = Awaited<ReturnType<typeof api.lead.list>>;
type Lead = LeadList["leads"][number];

interface TavilyResultsProps {
  leads: Lead[];
  meta: LeadList["meta"];
  contactableCount: number;
  perPage: PageSize;
  onPageChange: (page: number) => void;
  onPerPageChange: (perPage: PageSize) => void;
}

const leadStatus = (lead: Lead) => {
  if (!lead.enrichedAt) {
    return { label: "Pending", variant: "outline" } as const;
  }

  return lead.website || lead.linkedin
    ? ({ label: "Contactable", variant: "secondary" } as const)
    : ({ label: "No contact", variant: "outline" } as const);
};

export const TavilyResults = ({
  leads,
  meta,
  contactableCount,
  perPage,
  onPageChange,
  onPerPageChange,
}: TavilyResultsProps) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {`${formatNumber(meta.total)} leads, ${formatNumber(contactableCount)} contactable`}
      </p>
      {leads.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersIcon />
            </EmptyMedia>
            <EmptyTitle>No leads yet</EmptyTitle>
            <EmptyDescription>
              Leads appear here once a scrape has added them to the campaign.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lead</TableHead>
              <TableHead>Website</TableHead>
              <TableHead>LinkedIn</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((lead) => {
              const status = leadStatus(lead);

              return (
                <TableRow
                  className="cursor-pointer"
                  key={lead.leadId}
                  onClick={() =>
                    navigate({
                      to: "/admin/leads/$leadId",
                      params: { leadId: lead.leadId },
                    })
                  }
                >
                  <TableCell>
                    <Link
                      className="block max-w-64 truncate font-medium hover:underline"
                      onClick={(event) => event.stopPropagation()}
                      params={{ leadId: lead.leadId }}
                      to="/admin/leads/$leadId"
                    >
                      {lead.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <ExternalLink href={lead.website} />
                  </TableCell>
                  <TableCell>
                    <ExternalLink href={lead.linkedin} />
                  </TableCell>
                  <TableCell>
                    <EmailLink email={lead.email ?? undefined} />
                  </TableCell>
                  <TableCell>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <ListPagination
        currentPage={meta.page}
        lastPage={meta.lastPage}
        onPageChange={onPageChange}
        onPerPageChange={onPerPageChange}
        perPage={perPage}
      />
    </div>
  );
};

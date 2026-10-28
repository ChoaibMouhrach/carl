import { api } from "@/api";
import { ListPagination } from "@/components/list-pagination";
import { formatNumber } from "@/lib/format";
import type { PageSize } from "@repo/constants/pagination";
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
import { Building2Icon } from "lucide-react";
import { CommunityPrice } from "../../communities/community-price";

type CommunityList = Awaited<ReturnType<typeof api.community.list>>;

interface ScrapeResultsProps {
  communities: CommunityList["communities"];
  meta: CommunityList["meta"];
  perPage: PageSize;
  onPageChange: (page: number) => void;
  onPerPageChange: (perPage: PageSize) => void;
}

export const ScrapeResults = ({
  communities,
  meta,
  perPage,
  onPageChange,
  onPerPageChange,
}: ScrapeResultsProps) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {`${formatNumber(meta.total)} communities in this campaign`}
      </p>
      {communities.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Building2Icon />
            </EmptyMedia>
            <EmptyTitle>No communities yet</EmptyTitle>
            <EmptyDescription>
              Run the scrape to collect communities matching this campaign.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Community</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Members</TableHead>
              <TableHead>Price</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {communities.map((community) => (
              <TableRow
                className="cursor-pointer"
                key={community.communityId}
                onClick={() =>
                  navigate({
                    to: "/admin/communities/$communityId",
                    params: { communityId: community.communityId },
                  })
                }
              >
                <TableCell>
                  <Link
                    className="block max-w-64 truncate font-medium hover:underline"
                    onClick={(event) => event.stopPropagation()}
                    params={{ communityId: community.communityId }}
                    to="/admin/communities/$communityId"
                  >
                    {community.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link
                    className="hover:underline"
                    onClick={(event) => event.stopPropagation()}
                    params={{ leadId: community.lead.leadId }}
                    to="/admin/leads/$leadId"
                  >
                    {community.lead.name}
                  </Link>
                </TableCell>
                <TableCell>
                  {community.members === null
                    ? "—"
                    : formatNumber(community.members)}
                </TableCell>
                <TableCell>
                  <CommunityPrice community={community} />
                </TableCell>
              </TableRow>
            ))}
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

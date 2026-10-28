import { api } from "@/api";
import { CopyButton } from "@/components/copy-button";
import { CoverImage } from "@/components/cover-image";
import { PictureAvatar } from "@/components/picture-avatar";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Link } from "@tanstack/react-router";
import { CommunityPrice } from "../communities/community-price";

type Community = Awaited<ReturnType<typeof api.community.show>>;

interface CommunityDetailsProps {
  community: Community;
}

const Stat = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <Card>
    <CardHeader>
      <CardDescription>{label}</CardDescription>
      <CardTitle className="text-2xl">{value}</CardTitle>
    </CardHeader>
  </Card>
);

export const CommunityDetails = ({ community }: CommunityDetailsProps) => {
  const { lead } = community;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Members"
          value={
            community.members === null ? "—" : formatNumber(community.members)
          }
        />
        <Stat
          label="Monthly revenue"
          value={
            community.mrr === null ? "—" : formatCurrency(community.mrr, "USD")
          }
        />
        <Stat label="Price" value={<CommunityPrice community={community} />} />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>About</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {community.thumbnailUrl && (
              <CoverImage src={community.thumbnailUrl} />
            )}
            <p className="whitespace-pre-wrap wrap-anywhere">
              {community.description ?? (
                <span className="text-muted-foreground">
                  No description yet
                </span>
              )}
            </p>
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Owner</CardTitle>
            </CardHeader>
            <CardContent>
              {lead ? (
                <Link
                  className="flex items-center gap-3 hover:underline"
                  params={{ leadId: lead.leadId }}
                  to="/admin/leads/$leadId"
                >
                  <PictureAvatar name={lead.name} src={lead.pictureUrl} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {lead.name}
                    </span>
                    <span className="block truncate text-muted-foreground">
                      @{lead.username}
                    </span>
                  </span>
                </Link>
              ) : (
                <span className="text-muted-foreground">No owner</span>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4">
                <div>
                  <dt className="text-sm text-muted-foreground">Email</dt>
                  <dd className="mt-1 flex items-center gap-2">
                    {community.email ? (
                      <>
                        <a
                          className="min-w-0 break-all hover:underline"
                          href={`mailto:${community.email}`}
                        >
                          {community.email}
                        </a>
                        <CopyButton
                          label="Copy email address"
                          value={community.email}
                        />
                      </>
                    ) : (
                      <span className="text-muted-foreground">
                        No email yet
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Added</dt>
                  <dd className="mt-1">{formatDate(community.createdAt)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

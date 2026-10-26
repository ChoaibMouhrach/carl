import { api } from "@/api";
import { CopyButton } from "@/components/copy-button";
import { ExternalLink } from "@/components/external-link";
import { formatDate } from "@/lib/format";
import { socialFields, socialLabels } from "@/lib/lead";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";

type Lead = Awaited<ReturnType<typeof api.lead.show>>;

interface LeadDetailsProps {
  lead: Lead;
}

export const LeadDetails = ({ lead }: LeadDetailsProps) => {
  const links = socialFields.flatMap((field) => {
    const url = lead[field];
    return url ? [{ field, url }] : [];
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-5">
          <div>
            <dt className="text-sm text-muted-foreground">Email</dt>
            <dd className="mt-1 flex items-center gap-2">
              {lead.email ? (
                <>
                  <a
                    className="min-w-0 break-all hover:underline"
                    href={`mailto:${lead.email}`}
                  >
                    {lead.email}
                  </a>
                  <CopyButton label="Copy email address" value={lead.email} />
                </>
              ) : (
                <span className="text-muted-foreground">No email yet</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Links</dt>
            <dd className="mt-1">
              {links.length === 0 ? (
                <span className="text-muted-foreground">No links yet</span>
              ) : (
                <ul className="space-y-1">
                  {links.map(({ field, url }) => (
                    <li className="flex items-baseline gap-2" key={field}>
                      <span className="w-20 shrink-0 text-muted-foreground">
                        {socialLabels[field]}
                      </span>
                      <ExternalLink href={url} />
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Bio</dt>
            <dd className="mt-1 whitespace-pre-wrap wrap-anywhere">
              {lead.bio ?? (
                <span className="text-muted-foreground">No bio yet</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Added</dt>
            <dd className="mt-1">{formatDate(lead.createdAt)}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
};

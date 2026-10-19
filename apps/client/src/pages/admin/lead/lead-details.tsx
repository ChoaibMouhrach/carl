import { urlFieldLabels } from "@/lib/lead";
import { api } from "@/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";

type Lead = Awaited<ReturnType<typeof api.lead.show>>["lead"];

interface LeadDetailsProps {
  lead: Lead;
}

const linkFields = [
  "website",
  "linkedinUrl",
  "facebookUrl",
  "instagramUrl",
  "twitterUrl",
  "youtubeUrl",
] as const;

export const LeadDetails = ({ lead }: LeadDetailsProps) => {
  const links = linkFields.flatMap((field) => {
    const url = lead[field];
    return url ? [{ field, url }] : [];
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4">
          <div>
            <dt className="text-sm text-muted-foreground">Location</dt>
            <dd>{lead.location ?? "Not set"}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Emails</dt>
            <dd>
              {lead.emails.length === 0 ? (
                "Not set"
              ) : (
                <ul className="space-y-1">
                  {lead.emails.map((email) => (
                    <li className="break-all" key={email}>
                      <a className="hover:underline" href={`mailto:${email}`}>
                        {email}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Bio</dt>
            <dd className="whitespace-pre-wrap wrap-anywhere">
              {lead.bio ?? "Not set"}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Links</dt>
            <dd>
              {links.length === 0 ? (
                "No links yet."
              ) : (
                <ul className="space-y-1">
                  {links.map(({ field, url }) => (
                    <li className="break-all" key={field}>
                      <span className="text-muted-foreground">
                        {urlFieldLabels[field]}:{" "}
                      </span>
                      <a
                        className="hover:underline"
                        href={url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
};

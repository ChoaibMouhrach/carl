import { api } from "@/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const links = linkFields.flatMap((field) => {
    const url = lead[field];
    return url ? [{ field, url }] : [];
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("adminLead.details")}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4">
          <div>
            <dt className="text-sm text-muted-foreground">
              {t("adminLead.location")}
            </dt>
            <dd>{lead.location ?? t("adminLead.notSet")}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">
              {t("adminLead.emails")}
            </dt>
            <dd>
              {lead.emails.length === 0 ? (
                t("adminLead.notSet")
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
            <dt className="text-sm text-muted-foreground">
              {t("adminLead.bio")}
            </dt>
            <dd className="whitespace-pre-wrap wrap-anywhere">
              {lead.bio ?? t("adminLead.notSet")}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">
              {t("adminLead.links")}
            </dt>
            <dd>
              {links.length === 0 ? (
                t("adminLead.noLinks")
              ) : (
                <ul className="space-y-1">
                  {links.map(({ field, url }) => (
                    <li className="break-all" key={field}>
                      <span className="text-muted-foreground">
                        {t(`leadForm.${field}`)}:{" "}
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

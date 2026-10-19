import { displayUrl } from "@/lib/format";

interface ExternalLinkProps {
  empty?: string;
  href: string | null;
}

export const ExternalLink = ({ empty = "—", href }: ExternalLinkProps) =>
  href ? (
    <a
      className="block max-w-48 truncate hover:underline"
      href={href}
      onClick={(event) => event.stopPropagation()}
      rel="noreferrer"
      target="_blank"
    >
      {displayUrl(href)}
    </a>
  ) : (
    <span className="text-muted-foreground">{empty}</span>
  );

interface EmailLinkProps {
  email?: string;
}

export const EmailLink = ({ email }: EmailLinkProps) =>
  email ? (
    <a
      className="block max-w-48 truncate hover:underline"
      href={`mailto:${email}`}
      onClick={(event) => event.stopPropagation()}
    >
      {email}
    </a>
  ) : (
    <span className="text-muted-foreground">—</span>
  );

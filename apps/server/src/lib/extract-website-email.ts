import emailRegex from "email-regex";

const WEBSITE_PATHS = ["/", "/support", "/contact"] as const;

const WEBMAIL_DOMAINS = [
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
];

const ASSET_EXTENSION = /\.(png|jpe?g|gif|webp|svg|avif|ico|css|js|woff2?)$/i;
const NOT_A_CONTACT =
  /^(noreply|no-reply|donotreply|privacy|abuse|postmaster)@|@(sentry\.io|sentry-next\.wixpress\.com|example\.com)$/i;

const hostOf = (website: string): string | null => {
  try {
    const url = new URL(
      website.includes("://") ? website : `https://${website}`,
    );
    return url.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

export const websitePageUrls = (website: string): string[] => {
  try {
    const url = new URL(
      website.includes("://") ? website : `https://${website}`,
    );
    if (url.protocol !== "http:" && url.protocol !== "https:") return [];
    return WEBSITE_PATHS.map((path) => new URL(path, url.origin).href);
  } catch {
    return [];
  }
};

const belongsToSite = (email: string, host: string): boolean => {
  const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();

  return (
    domain === host ||
    domain.endsWith(`.${host}`) ||
    host.endsWith(`.${domain}`) ||
    WEBMAIL_DOMAINS.includes(domain)
  );
};

const MAX_EMAILS = 10;

/** Lists addresses on the lead's own domain first and ignores template and tracking addresses */
export const extractWebsiteEmails = (
  pages: string[],
  website: string,
): string[] => {
  const host = hostOf(website);
  if (host === null) return [];

  const candidates = pages
    .flatMap(
      (html) => html.match(emailRegex({ allowSingleLabelDomain: false })) ?? [],
    )
    .map((candidate) => candidate.toLowerCase())
    .filter(
      (candidate) =>
        !ASSET_EXTENSION.test(candidate) && !NOT_A_CONTACT.test(candidate),
    )
    .filter((candidate) => belongsToSite(candidate, host));

  const isWebmail = (candidate: string) =>
    WEBMAIL_DOMAINS.some((domain) => candidate.endsWith(`@${domain}`));

  return [...new Set(candidates)]
    .toSorted((a, b) => Number(isWebmail(a)) - Number(isWebmail(b)))
    .slice(0, MAX_EMAILS);
};

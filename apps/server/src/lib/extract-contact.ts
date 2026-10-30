import emailRegex from "email-regex";
import type { WebSearchResult } from "./base-web-search";

export interface ExtractedContact {
  website: string | null;
  linkedin: string | null;
  emails: string[];
}

const NOT_A_PERSONAL_SITE = [
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "tiktok.com",
  "skool.com",
  "wikipedia.org",
  "crunchbase.com",
  "reddit.com",
  "medium.com",
];

const LINKEDIN_PROFILE =
  /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[^/?#]+/i;
const GENERIC_MAILBOXES = /^(noreply|no-reply|support|privacy|abuse)@/i;

const hostOf = (url: string): string | null => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

const isPersonalSite = (url: string): boolean => {
  const host = hostOf(url);

  return (
    host !== null &&
    !NOT_A_PERSONAL_SITE.some(
      (blocked) => host === blocked || host.endsWith(`.${blocked}`),
    )
  );
};

/** Only results that mention the person by name are trusted, to avoid attaching a stranger's details */
export const extractContact = (
  results: WebSearchResult[],
  personName: string,
): ExtractedContact => {
  const needle = personName.trim().toLowerCase();

  if (needle === "") {
    return { website: null, linkedin: null, emails: [] };
  }

  const relevant = results.filter((result) =>
    `${result.title} ${result.content}`.toLowerCase().includes(needle),
  );

  const linkedinResult = relevant.find((result) =>
    LINKEDIN_PROFILE.test(result.url),
  );
  const websiteResult = relevant.find((result) => isPersonalSite(result.url));
  const emails = relevant
    .flatMap(
      (result) =>
        result.content.match(emailRegex({ allowSingleLabelDomain: false })) ??
        [],
    )
    .filter((candidate) => !GENERIC_MAILBOXES.test(candidate));

  return {
    website: websiteResult ? new URL(websiteResult.url).origin : null,
    linkedin: linkedinResult
      ? (linkedinResult.url.match(LINKEDIN_PROFILE)?.[0] ?? null)
      : null,
    emails: [...new Set(emails.map((email) => email.toLowerCase()))],
  };
};

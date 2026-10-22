import { notWebsiteDomains } from "./web-presence";

export const NO_USABLE_NAME = "No usable name";
export const NO_USABLE_WEBSITE = "No usable website";

const sharedDomains = [
  ...notWebsiteDomains,
  "linktr.ee",
  "linktree.com",
  "beacons.ai",
  "bio.link",
  "lnk.bio",
  "tap.bio",
  "solo.to",
  "stan.store",
  "taplink.cc",
  "campsite.bio",
  "carrd.co",
  "notion.site",
  "notion.so",
  "github.io",
  "wixsite.com",
  "wordpress.com",
  "blogspot.com",
  "medium.com",
  "substack.com",
  "google.com",
  "calendly.com",
  "gumroad.com",
  "mykajabi.com",
  "teachable.com",
  "linkedin.com",
];

const hostMatches = (host: string, domain: string) =>
  host === domain || host.endsWith(`.${domain}`);

export const splitName = (name: string) => {
  const words = name
    .replace(/\([^)]*\)/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((word) => word.length > 1 && /\p{L}/u.test(word));
  const firstName = words.at(0);
  const lastName = words.at(-1);

  if (words.length < 2 || !firstName || !lastName) return null;

  return { firstName, lastName };
};

export const domainOf = (website: string) => {
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(website)
    ? website
    : `https://${website}`;

  try {
    const host = new URL(withScheme).hostname
      .toLowerCase()
      .replace(/^www\./, "");

    if (!host.includes(".") || /^[\d.]+$/.test(host)) return null;
    if (sharedDomains.some((domain) => hostMatches(host, domain))) return null;

    return host;
  } catch {
    return null;
  }
};

export const buildLookup = (lead: {
  key: string;
  name: string;
  website: string | null;
  linkedinUrl: string | null;
}) => {
  const name = splitName(lead.name);
  const domain = lead.website ? domainOf(lead.website) : null;
  const linkedinUrl = lead.linkedinUrl || null;

  if (!linkedinUrl && !name) return { reason: NO_USABLE_NAME };
  if (!linkedinUrl && !domain) return { reason: NO_USABLE_WEBSITE };

  return {
    lookup: {
      key: lead.key,
      firstName: name?.firstName ?? null,
      lastName: name?.lastName ?? null,
      domain,
      linkedinUrl,
    },
  };
};

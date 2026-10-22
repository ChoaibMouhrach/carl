import type { WebSearchResult } from "./base-web-search";

export const LINKEDIN_DOMAIN = "linkedin.com";

export const notWebsiteDomains = [
  LINKEDIN_DOMAIN,
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "tiktok.com",
  "reddit.com",
  "pinterest.com",
  "skool.com",
];

const hostMatches = (host: string, domain: string) =>
  host === domain || host.endsWith(`.${domain}`);

const parseUrl = (value: string) => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const nameAndCommunity = (input: { name: string; community: string | null }) =>
  [input.name, input.community].filter(Boolean).join(" ");

export const linkedinQuery = (input: {
  name: string;
  community: string | null;
}) => `${nameAndCommunity(input)} LinkedIn`;

export const websiteQuery = (input: {
  name: string;
  community: string | null;
}) => `${nameAndCommunity(input)} official website`;

const tokens = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 1);

const mentionsPerson = (found: Set<string>, name: string) => {
  const words = tokens(name);
  const first = words.at(0);
  const last = words.at(-1);

  if (!first || !last) return false;

  return found.has(first) && found.has(last);
};

const mentionsCommunity = (found: Set<string>, community: string | null) => {
  const words = community ? tokens(community) : [];

  return words.length > 0 && words.every((word) => found.has(word));
};

export const pickLinkedinUrl = (
  results: WebSearchResult[],
  subject: { name: string },
) => {
  for (const result of results) {
    const url = parseUrl(result.url);

    if (!url || !hostMatches(url.hostname, LINKEDIN_DOMAIN)) continue;
    if (!url.pathname.startsWith("/in/")) continue;

    const found = new Set(tokens(`${result.title} ${url.pathname}`));

    if (!mentionsPerson(found, subject.name)) continue;

    return `https://www.linkedin.com${url.pathname.replace(/\/+$/, "")}`;
  }

  return null;
};

export const pickWebsite = (
  results: WebSearchResult[],
  subject: { name: string; community: string | null },
) => {
  for (const result of results) {
    const url = parseUrl(result.url);

    if (!url || !/^https?:$/.test(url.protocol)) continue;
    if (notWebsiteDomains.some((domain) => hostMatches(url.hostname, domain)))
      continue;

    const found = new Set(
      tokens(`${result.title} ${result.content} ${url.hostname}`),
    );

    if (
      !mentionsPerson(found, subject.name) &&
      !mentionsCommunity(found, subject.community)
    ) {
      continue;
    }

    return url.href;
  }

  return null;
};

import emailRegex from "email-regex";
import { parse } from "node-html-parser";
import { z } from "zod";
import {
  BaseSkoolScrapper,
  SkoolScrapeError,
  type Community,
  type FullCommunity,
  type FullLead,
  type Pricing,
} from "@server/lib/base-skool-scrapper";
import type { BaseLogger } from "@server/lib/base-logger";

const BASE_URL = "https://www.skool.com";
const REQUEST_TIMEOUT_MS = 15_000;

// Skool stops listing at 1000 results (34 pages of 30) and wraps back to page 1 past that
const MAX_DISCOVERY_PAGES = 34;

// Skool serves a bot-challenge page (HTTP 202) when the request carries an `accept` header
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

// Skool ships nested objects as JSON-encoded strings inside the metadata
const jsonString = <T extends z.ZodType>(schema: T) =>
  z.string().transform((raw, ctx): z.output<T> => {
    try {
      const parsed = schema.safeParse(JSON.parse(raw));

      if (parsed.success) {
        return parsed.data;
      }

      for (const issue of parsed.error.issues) {
        ctx.addIssue({
          code: "custom",
          message: issue.message,
          path: issue.path,
        });
      }
    } catch {
      ctx.addIssue({ code: "custom", message: "Not valid JSON" });
    }

    return z.NEVER;
  });

const optionalText = z
  .string()
  .nullish()
  .transform((value) => value || null);

// displayPrice is the current format; legacy communities carry bare monthly (currentMBp) or
// one-time (currentOtBp) prices instead, with no interval
const displayPriceSchema = z.object({
  currency: z.string(),
  amount: z.number(),
  recurring_interval: z.enum(["month", "year", "one_time"]),
});

const legacyPriceSchema = z.object({
  currency: z.string(),
  amount: z.number(),
});

const ownerSchema = z.object({ name: z.string() });

const groupMetadataSchema = z.object({
  displayName: z.string(),
  description: z.string(),
  lpDescription: z.string().nullish(),
  coverSmallUrl: optionalText,
  logoUrl: optionalText,
  totalMembers: z.number(),
  displayPrice: jsonString(displayPriceSchema).nullish(),
  currentMBp: jsonString(legacyPriceSchema).nullish(),
  currentOtBp: jsonString(legacyPriceSchema).nullish(),
});

const groupSchema = z.object({
  name: z.string(),
  metadata: groupMetadataSchema,
});

const aboutGroupSchema = z.object({
  name: z.string(),
  metadata: groupMetadataSchema.extend({ owner: jsonString(ownerSchema) }),
});

const discoverSchema = z.object({
  props: z.object({
    pageProps: z.object({
      // Pages past the last one come back without a groups key
      groups: z.array(z.object({ group: z.unknown() })).default([]),
      numGroups: z.number(),
    }),
  }),
});

const aboutSchema = z.object({
  props: z.object({
    pageProps: z.object({ currentGroup: aboutGroupSchema }),
  }),
});

const leadSchema = z.object({
  props: z.object({
    pageProps: z.object({
      currentUser: z.object({
        name: z.string(),
        firstName: z.string(),
        lastName: z.string(),
        metadata: z.object({
          bio: optionalText,
          pictureProfile: optionalText,
          linkInstagram: optionalText,
          linkFacebook: optionalText,
          linkLinkedin: optionalText,
          linkWebsite: optionalText,
        }),
      }),
    }),
  }),
});

type Group = z.output<typeof groupSchema>;

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export class CustomSkoolScrapper extends BaseSkoolScrapper {
  private readonly logger: BaseLogger;
  private readonly fetcher: Fetcher;

  public constructor(input: { logger: BaseLogger; fetcher?: Fetcher }) {
    super();
    this.fetcher = input.fetcher ?? fetch;
    this.logger = input.logger.child({ scope: "skool-scrapper" });
  }

  public async discover(query: { search: string }): Promise<Community[]> {
    const first = await this.fetchDiscoveryPage(query.search, 1);

    const pageSize = first.communities.length;
    const pageCount =
      pageSize === 0
        ? 1
        : Math.min(Math.ceil(first.total / pageSize), MAX_DISCOVERY_PAGES);

    const remainingPages = Array.from(
      { length: pageCount - 1 },
      (_, index) => index + 2,
    );

    const settled = await Promise.allSettled(
      remainingPages.map(
        async (page) => await this.fetchDiscoveryPage(query.search, page),
      ),
    );

    const remaining = settled.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );

    const failures = settled.flatMap((result, index) => {
      if (result.status === "fulfilled") {
        return [];
      }

      const reason: unknown = result.reason;
      return [{ page: remainingPages[index], reason }];
    });

    // Every extra page failing points to a block, so let the job retry; a few misses
    // are picked up by the next scrape, which skips the communities already stored
    if (failures.length > 0 && remaining.length === 0) {
      throw failures[0]?.reason;
    }

    if (failures.length > 0) {
      void this.logger.warn({
        message: "Some Skool discovery pages failed and were left out",
        failedPages: failures.map((failure) => failure.page),
        reasons: failures.map((failure) =>
          failure.reason instanceof Error
            ? failure.reason.message
            : String(failure.reason),
        ),
      });
    }

    const communities = [first, ...remaining].flatMap(
      (page) => page.communities,
    );

    // Pages can overlap while the results shift between requests
    return [
      ...new Map(
        communities.map((community) => [community.communityURL, community]),
      ).values(),
    ];
  }

  private async fetchDiscoveryPage(search: string, page: number) {
    const params = new URLSearchParams({
      q: search,
      ty: "public",
      pr: "paid",
      lang: "english",
    });

    if (page > 1) {
      params.set("p", String(page));
    }

    const path = `/discovery?${params}`;
    const data = await this.fetchNextData(path);

    if (!data) {
      throw new SkoolScrapeError({
        kind: "upstream",
        message: `Skool discovery page not found for ${path}`,
      });
    }

    const { groups, numGroups } = discoverSchema.parse(data).props.pageProps;

    // One malformed community must not discard the rest of the page
    const communities = groups.flatMap(({ group }) => {
      const parsed = groupSchema.safeParse(group);

      if (!parsed.success) {
        void this.logger.warn({
          message: "Skipped malformed community in discovery results",
          path,
          issue: this.summarizeIssues(parsed.error),
        });
        return [];
      }

      return [this.toCommunity(parsed.data)];
    });

    return { communities, total: numGroups };
  }

  public async about(input: {
    communityURL: string;
  }): Promise<FullCommunity | null> {
    const slug = this.slugFromURL(input.communityURL);

    const path = `/${slug}/about`;
    const data = await this.fetchNextData(path);

    if (!data) {
      return null;
    }

    const { currentGroup } = aboutSchema.parse(data).props.pageProps;

    return {
      ...this.toCommunity(currentGroup),
      leadURL: `${BASE_URL}/@${currentGroup.metadata.owner.name}`,
    };
  }

  public async lead(input: { leadURL: string }): Promise<FullLead | null> {
    const slug = this.slugFromURL(input.leadURL);

    const path = `/${slug}`;
    const data = await this.fetchNextData(path);

    if (!data) {
      return null;
    }

    const { currentUser } = leadSchema.parse(data).props.pageProps;

    const { metadata } = currentUser;

    const fullName = [currentUser.firstName, currentUser.lastName]
      .filter(Boolean)
      .join(" ");

    return {
      name: fullName || currentUser.name,
      username: currentUser.name,
      leadURL: `${BASE_URL}/@${currentUser.name}`,
      bio: metadata.bio,
      instagram: metadata.linkInstagram,
      facebook: metadata.linkFacebook,
      linkedin: metadata.linkLinkedin,
      website: metadata.linkWebsite,
      email: this.firstEmail(metadata.bio),
      pictureUrl: metadata.pictureProfile,
    };
  }

  private toCommunity(group: Group): Community {
    const { metadata } = group;
    const pricing = this.toPricing(group);

    return {
      name: metadata.displayName,
      communityURL: `${BASE_URL}/${group.name}`,
      description: metadata.description || null,
      members: metadata.totalMembers,
      pricing,
      mrr: this.estimateMrr(metadata.totalMembers, pricing),
      email: this.firstEmail(metadata.description, metadata.lpDescription),
      thumbnailUrl: metadata.coverSmallUrl,
      logoUrl: metadata.logoUrl,
    };
  }

  private toPricing(group: Group): Pricing {
    const { displayPrice, currentMBp, currentOtBp } = group.metadata;

    if (displayPrice) {
      if (currentMBp && currentMBp.amount !== displayPrice.amount) {
        void this.logger.warn({
          message:
            "Skool community has conflicting displayPrice and currentMBp",
          community: group.name,
          displayPrice,
          currentMBp,
        });
      }

      return {
        type: "paid",
        amountCents: displayPrice.amount,
        currency: displayPrice.currency,
        interval: displayPrice.recurring_interval,
        source: "displayPrice",
      };
    }

    if (currentMBp) {
      return {
        type: "paid",
        amountCents: currentMBp.amount,
        currency: currentMBp.currency,
        interval: "month",
        source: "legacy",
      };
    }

    if (currentOtBp) {
      return {
        type: "paid",
        amountCents: currentOtBp.amount,
        currency: currentOtBp.currency,
        interval: "one_time",
        source: "legacy",
      };
    }

    return { type: "free" };
  }

  // Skool doesn't expose revenue, so this assumes every member pays the headline price
  private estimateMrr(members: number, pricing: Pricing) {
    if (pricing.type === "free" || pricing.interval === "one_time") {
      return 0;
    }

    const monthlyCents =
      pricing.interval === "year"
        ? pricing.amountCents / 12
        : pricing.amountCents;

    return Math.round((members * monthlyCents) / 100);
  }

  private firstEmail(...texts: (string | null | undefined)[]) {
    const regex = emailRegex({ allowSingleLabelDomain: false });

    for (const text of texts) {
      const email = text?.match(regex)?.[0];

      if (email) {
        return email;
      }
    }

    return null;
  }

  private slugFromURL(url: string) {
    let parsedURL: URL;

    try {
      parsedURL = new URL(url);
    } catch (error) {
      throw new SkoolScrapeError({
        kind: "invalid_input",
        message: `Invalid URL: ${url}`,
        cause: error,
      });
    }

    const { hostname, pathname } = parsedURL;

    if (hostname !== "www.skool.com" && hostname !== "skool.com") {
      throw new SkoolScrapeError({
        kind: "invalid_input",
        message: `Not a Skool URL: ${url}`,
      });
    }

    const slug = pathname.split("/").find(Boolean);

    if (!slug) {
      throw new SkoolScrapeError({
        kind: "invalid_input",
        message: `No community or user in Skool URL: ${url}`,
      });
    }

    return slug;
  }

  private summarizeIssues(error: z.ZodError) {
    const [first, ...rest] = error.issues;

    if (!first) {
      return "unknown validation error";
    }

    const location = first.path.length ? first.path.join(".") : "(root)";
    const more = rest.length ? ` (+${rest.length} more)` : "";

    return `${location}: ${first.message}${more}`;
  }

  private async fetchNextData(path: string): Promise<unknown> {
    let response: Response;

    try {
      response = await this.fetcher(`${BASE_URL}${path}`, {
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new SkoolScrapeError({
        kind: "upstream",
        message: `Request to Skool failed for ${path}`,
        cause: error,
      });
    }

    if (response.status === 404) {
      return null;
    }

    if (response.status === 429) {
      throw new SkoolScrapeError({
        kind: "rate_limited",
        message: `Skool rate limited the request for ${path}`,
      });
    }

    if (response.status === 202 || response.status === 403) {
      throw new SkoolScrapeError({
        kind: "blocked",
        message: `Skool served a bot challenge (${response.status}) for ${path}`,
      });
    }

    if (!response.ok) {
      throw new SkoolScrapeError({
        kind: "upstream",
        message: `Skool responded ${response.status} for ${path}`,
      });
    }

    // A private, renamed or login-gated page redirects elsewhere; its data isn't the requested entity's
    const expectedPath = new URL(path, BASE_URL).pathname;

    if (new URL(response.url).pathname !== expectedPath) {
      return null;
    }

    const html = await response.text();
    const raw = parse(html).querySelector("script#__NEXT_DATA__")?.text;

    if (!raw) {
      throw new SkoolScrapeError({
        kind: "parse",
        message: `__NEXT_DATA__ not found for ${path}`,
      });
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      throw new SkoolScrapeError({
        kind: "parse",
        message: `__NEXT_DATA__ is not valid JSON for ${path}`,
        cause: error,
      });
    }
  }
}

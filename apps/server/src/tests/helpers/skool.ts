import {
  communitiesTable,
  leadsTable,
} from "@server/infrastructure/database/schemas";
import type { DB } from "@server/infrastructure/database/client";
import {
  BaseSkoolScrapper,
  type Community,
  type FullCommunity,
  type FullLead,
} from "@server/lib/base-skool-scrapper";

export const paidMonthly = (slug: string, members = 10): Community => ({
  name: slug.toUpperCase(),
  communityURL: `https://www.skool.com/${slug}`,
  description: `About ${slug}`,
  members,
  pricing: {
    type: "paid",
    amountCents: 2700,
    currency: "usd",
    interval: "month",
    source: "displayPrice",
  },
  mrr: members * 27,
  email: `${slug}@example.com`,
  thumbnailUrl: `https://assets.skool.com/${slug}-md.jpg`,
  logoUrl: `https://assets.skool.com/${slug}-logo.jpg`,
});

export const freeCommunity = (slug: string): Community => ({
  ...paidMonthly(slug),
  pricing: { type: "free" },
  mrr: 0,
  email: null,
});

export const lead = (username: string): FullLead => ({
  name: `Lead ${username}`,
  username,
  leadURL: `https://www.skool.com/@${username}`,
  bio: `Bio of ${username}`,
  instagram: null,
  facebook: null,
  linkedin: null,
  website: null,
  email: `${username}@example.com`,
  pictureUrl: `https://assets.skool.com/${username}-md.jpg`,
});

export class FakeSkoolScrapper extends BaseSkoolScrapper {
  public aboutCalls: string[] = [];
  public leadCalls: string[] = [];
  public discoverCalls: { search: string }[] = [];
  public leadOverrides: Record<string, Partial<FullLead>> = {};
  /** Fails the next `remaining` lead fetches for a username, then recovers */
  public leadFailures: Record<string, { error: Error; remaining: number }> = {};

  public constructor(
    private readonly data: {
      pages: Record<number, Community[]>;
      owners: Record<string, string>;
      missingCommunities?: string[];
      missingLeads?: string[];
      leadError?: Error;
    },
  ) {
    super();
  }

  public override async discover(query: {
    search: string;
  }): Promise<Community[]> {
    this.discoverCalls.push(query);

    return Object.values(this.data.pages).flat();
  }

  public override async about(input: {
    communityURL: string;
  }): Promise<FullCommunity | null> {
    this.aboutCalls.push(input.communityURL);

    if (this.data.missingCommunities?.includes(input.communityURL)) {
      return null;
    }

    const community = Object.values(this.data.pages)
      .flat()
      .find((candidate) => candidate.communityURL === input.communityURL);
    const owner = this.data.owners[input.communityURL];

    if (!community || !owner) {
      throw new Error(`Unknown community ${input.communityURL}`);
    }

    return { ...community, leadURL: `https://www.skool.com/@${owner}` };
  }

  public override async lead(input: {
    leadURL: string;
  }): Promise<FullLead | null> {
    this.leadCalls.push(input.leadURL);

    if (this.data.leadError) {
      throw this.data.leadError;
    }

    const failure =
      this.leadFailures[input.leadURL.replace("https://www.skool.com/@", "")];

    if (failure && failure.remaining > 0) {
      failure.remaining -= 1;
      throw failure.error;
    }

    if (this.data.missingLeads?.includes(input.leadURL)) {
      return null;
    }

    const username = input.leadURL.replace("https://www.skool.com/@", "");

    return { ...lead(username), ...this.leadOverrides[username] };
  }
}

export const tableRows = async (db: DB) => ({
  leads: await db.select().from(leadsTable),
  communities: await db.select().from(communitiesTable),
});

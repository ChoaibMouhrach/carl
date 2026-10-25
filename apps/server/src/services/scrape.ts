import { BaseService } from "@server/lib/base-service";
import type { Community as ScrapedCommunity } from "@server/lib/base-skool-scrapper";
import type { CommunityInsert } from "@server/infrastructure/database/schemas";
import type { ScrapeFilters } from "@server/lib/base-queue";

interface StartScrapeInput extends ScrapeFilters {
  search: string;
}

export class ScrapeService extends BaseService {
  public async start(input: StartScrapeInput): Promise<void> {
    await this.context.queueHub.scrape.add({ type: "discover", ...input });
  }

  public async discover(input: StartScrapeInput): Promise<void> {
    const communities = await this.context.skoolScrapper.discover({
      search: input.search,
    });

    const matching = communities.filter((community) =>
      this.matchesFilters(community, input),
    );

    const stored = await this.context.repositories.community.findAllBySkoolUrls(
      { skoolUrls: matching.map((community) => community.communityURL) },
    );
    const storedUrls = new Set(stored.map((community) => community.skoolUrl));

    await Promise.all(
      matching
        .filter((community) => !storedUrls.has(community.communityURL))
        .map(
          async (community) =>
            await this.context.queueHub.scrape.add({
              type: "scrape-community",
              communityURL: community.communityURL,
            }),
        ),
    );
  }

  public async scrapeCommunity(input: { communityURL: string }): Promise<void> {
    const about = await this.context.skoolScrapper.about(input);

    if (!about) {
      void this.context.logger.warn({
        message: "Skool community not found, skipped.",
        communityURL: input.communityURL,
      });
      return;
    }

    const { leadURL, ...community } = about;

    await this.context.queueHub.scrape.add({
      type: "scrape-lead",
      leadURL,
      community,
    });
  }

  public async scrapeLead(input: {
    leadURL: string;
    community: ScrapedCommunity;
  }): Promise<void> {
    const lead = await this.context.skoolScrapper.lead({
      leadURL: input.leadURL,
    });

    if (!lead) {
      void this.context.logger.warn({
        message: "Skool lead not found, community skipped.",
        leadURL: input.leadURL,
        communityURL: input.community.communityURL,
      });
      return;
    }

    await this.context.repositories.transaction(async ({ tx }) => {
      const saved = await tx.lead.upsertBySkoolUrl({
        name: lead.name,
        username: lead.username,
        skoolUrl: lead.leadURL,
        bio: lead.bio,
        instagram: lead.instagram,
        facebook: lead.facebook,
        linkedin: lead.linkedin,
        website: lead.website,
        email: lead.email,
      });

      await tx.community.upsertBySkoolUrl(
        this.toCommunityInsert(input.community, saved.leadId),
      );
    });
  }

  private toCommunityInsert(
    community: ScrapedCommunity,
    leadId: number,
  ): CommunityInsert {
    const paid = community.pricing.type === "paid" ? community.pricing : null;

    return {
      leadId,
      name: community.name,
      skoolUrl: community.communityURL,
      description: community.description,
      members: community.members,
      mrr: community.mrr,
      email: community.email,
      isFree: !paid,
      priceCents: paid?.amountCents ?? null,
      priceCurrency: paid?.currency ?? null,
      priceInterval: paid?.interval ?? null,
    };
  }

  private matchesFilters(
    community: ScrapedCommunity,
    filters: ScrapeFilters,
  ): boolean {
    const { minMembers, maxMembers, minPrice, maxPrice } = filters;

    if (minMembers !== undefined && community.members < minMembers) {
      return false;
    }

    if (maxMembers !== undefined && community.members > maxMembers) {
      return false;
    }

    const price = this.monthlyDollars(community);

    if (minPrice !== undefined && price < minPrice) {
      return false;
    }

    return maxPrice === undefined || price <= maxPrice;
  }

  // A one-time price can't be spread over months, so it is compared as is
  private monthlyDollars(community: ScrapedCommunity): number {
    const { pricing } = community;

    if (pricing.type === "free") {
      return 0;
    }

    const dollars = pricing.amountCents / 100;

    return pricing.interval === "year" ? dollars / 12 : dollars;
  }
}

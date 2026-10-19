import {
  SKOOL_COMMUNITY_CONCURRENCY,
  SKOOL_DISCOVERY_CONCURRENCY,
  SKOOL_DISCOVERY_MAX_RESULTS,
  SKOOL_DISCOVERY_PAGE_SIZE,
} from "@server/config/constants";
import type { Lead, LeadInsert } from "@server/infrastructure/database/schemas";
import {
  buildSearches,
  classifyGroup,
  searchName,
  type DiscoveredCommunity,
  type DiscoveryCriteria,
} from "@server/lib/skool-discovery";
import type { SkoolOwner, SkoolProfile } from "@server/lib/base-skool-scraper";
import { BaseService } from "@server/lib/base-service";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "@server/lib/errors";
import { derivePricing } from "@server/lib/pricing";
import {
  matchesFilters,
  type CommunityFilters,
} from "@server/lib/skool-filters";
import { extractEmails, mapPool } from "@server/lib/utils";

const SKOOL_URL = "https://www.skool.com";

export interface ScrapeFailure {
  target: string;
  reason: string;
}

export interface ScrapeSummary {
  keyword: string;
  discovered: number;
  alreadyKnown: number;
  duplicatesInRun: number;
  communitiesCreated: number;
  leadsCreated: number;
  leadsReused: number;
  filteredOut: number;
  failures: ScrapeFailure[];
}

interface RunState {
  keyword: string;
  filters: CommunityFilters;
  communities: Map<string, Promise<unknown>>;
  leads: Map<string, Promise<Lead>>;
  leadIds: Set<number>;
  summary: ScrapeSummary;
}

const toMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export class ScrapeService extends BaseService {
  public async run(input: {
    keyword: string;
    searches?: DiscoveryCriteria[];
    filters?: CommunityFilters;
    discoveryConcurrency?: number;
    communityConcurrency?: number;
  }): Promise<{ summary: ScrapeSummary; leadIds: number[] }> {
    const summary: ScrapeSummary = {
      keyword: input.keyword,
      discovered: 0,
      alreadyKnown: 0,
      duplicatesInRun: 0,
      communitiesCreated: 0,
      leadsCreated: 0,
      leadsReused: 0,
      filteredOut: 0,
      failures: [],
    };

    const discovered = await this.discover({
      keyword: input.keyword,
      searches: input.searches ?? this.context.discoveryCriteria,
      concurrency: input.discoveryConcurrency ?? SKOOL_DISCOVERY_CONCURRENCY,
      failures: summary.failures,
    });
    summary.discovered = discovered.length;

    // Discovery results are not deduplicated; only the community page fetch is skipped when we already hold it
    const knownCommunities =
      await this.context.repositories.community.findKnownBySkoolIds({
        skoolIds: discovered.map((community) => community.skoolId),
      });
    const filters = input.filters ?? {};
    const matching = knownCommunities.filter((row) =>
      matchesFilters(filters, row),
    );
    summary.filteredOut += knownCommunities.length - matching.length;
    const known = new Set(knownCommunities.map((row) => row.skoolId));
    const pending = discovered.filter(
      (community) => !known.has(community.skoolId),
    );
    summary.alreadyKnown = discovered.length - pending.length;

    const state: RunState = {
      keyword: input.keyword,
      filters,
      communities: new Map(),
      leads: new Map(),
      leadIds: new Set(matching.map((row) => row.leadId)),
      summary,
    };

    let processed = 0;

    await mapPool(
      pending,
      input.communityConcurrency ?? SKOOL_COMMUNITY_CONCURRENCY,
      async (community) => {
        await this.scrapeCommunity(community, state);
        processed += 1;

        if (processed % 25 === 0 || processed === pending.length) {
          await this.context.logger.info(
            `communities ${processed}/${pending.length}`,
          );
          await this.context.eventBus.publish(
            "leads.changed",
            "communities.changed",
          );
        }
      },
    );

    return { summary, leadIds: [...state.leadIds] };
  }

  public async start(input: { campaignId: number; replace?: boolean }) {
    const { repositories, queueHub, eventBus } = this.context;

    const campaign = await repositories.campaign.findByCampaignId(input);

    if (!campaign) {
      throw new NotFoundError({ message: "Campaign not found." });
    }

    if (campaign.status !== "active") {
      throw new BadRequestError({
        message: "Activate the campaign before scraping.",
      });
    }

    const active = await repositories.scrapeRun.findActiveByCampaignId(input);

    if (active) {
      throw new ConflictError({
        message: "A scrape is already running for this campaign.",
      });
    }

    const scrapeRun = await repositories.scrapeRun.create({
      campaignId: input.campaignId,
      replace: input.replace,
    });

    await queueHub.scrape.add(
      { scrapeRunId: scrapeRun.scrapeRunId },
      { idempotencyKey: `scrape-run-${scrapeRun.scrapeRunId}` },
    );
    await eventBus.publish("campaigns.changed");

    return { scrapeRun };
  }

  public async runCampaign(input: { scrapeRunId: number }) {
    const { repositories, eventBus } = this.context;

    const scrapeRun = await repositories.scrapeRun.findByScrapeRunId(input);
    const campaign =
      scrapeRun &&
      (await repositories.campaign.findByCampaignId({
        campaignId: scrapeRun.campaignId,
      }));

    if (!scrapeRun || !campaign) return;

    await repositories.scrapeRun.update(input, {
      status: "running",
      startedAt: new Date(),
      finishedAt: null,
      error: null,
    });
    await eventBus.publish("campaigns.changed");

    try {
      const { summary, leadIds } = await this.run({
        keyword: campaign.keyword,
        searches: buildSearches(campaign.types, campaign.pricingModels),
        filters: campaign,
      });

      // A lead that finished the scrape has completed stage 1 and waits for stage 2
      const leadsAttached = await repositories.campaignLead.attach({
        campaignId: campaign.campaignId,
        leadIds,
        stage: 1,
        status: "done",
        keyword: campaign.keyword,
      });

      // An incomplete run cannot tell a lead that is gone from one it failed to reach
      const leadsRemoved =
        scrapeRun.replace && summary.failures.length === 0
          ? await this.removeUnfoundLeads(campaign.campaignId, leadIds)
          : 0;

      await repositories.scrapeRun.update(input, {
        status: "completed",
        finishedAt: new Date(),
        summary: { ...summary, leadsAttached, leadsRemoved },
      });
      await eventBus.publish(
        "campaigns.changed",
        "leads.changed",
        "communities.changed",
      );
    } catch (error) {
      await repositories.scrapeRun.update(input, {
        status: "failed",
        finishedAt: new Date(),
        error: toMessage(error),
      });
      await eventBus.publish(
        "campaigns.changed",
        "leads.changed",
        "communities.changed",
      );

      throw error;
    }
  }

  // Leads that moved past stage 1 are kept: they carry pipeline progress
  private async removeUnfoundLeads(campaignId: number, foundLeadIds: number[]) {
    const { campaignLead } = this.context.repositories;

    const found = new Set(foundLeadIds);
    const stageOne = await campaignLead.listLeadIdsAtStage({
      campaignId,
      stage: 1,
    });

    return await campaignLead.removeByLeadIds({
      campaignId,
      leadIds: stageOne.filter((leadId) => !found.has(leadId)),
    });
  }

  private async discover(input: {
    keyword: string;
    searches: DiscoveryCriteria[];
    concurrency: number;
    failures: ScrapeFailure[];
  }): Promise<DiscoveredCommunity[]> {
    const { skoolScraper, logger } = this.context;

    const firstPages = await Promise.all(
      input.searches.map(async (criteria) => ({
        criteria,
        result: await skoolScraper.discover({
          ...criteria,
          keyword: input.keyword,
          page: 1,
        }),
      })),
    );

    const remaining = firstPages.flatMap(({ criteria, result }) => {
      const reachable = Math.min(
        result.totalGroups,
        SKOOL_DISCOVERY_MAX_RESULTS,
      );
      const lastPage = Math.ceil(reachable / SKOOL_DISCOVERY_PAGE_SIZE);

      return Array.from({ length: Math.max(0, lastPage - 1) }, (_, index) => ({
        criteria,
        page: index + 2,
      }));
    });

    await logger.info(
      `discovery: ${firstPages
        .map(
          ({ criteria, result }) =>
            `${searchName(criteria)}=${result.totalGroups}`,
        )
        .join(" ")}, ${remaining.length} more pages`,
    );

    const otherPages = await mapPool(
      remaining,
      input.concurrency,
      async ({ criteria, page }) => {
        try {
          const result = await skoolScraper.discover({
            ...criteria,
            keyword: input.keyword,
            page,
          });
          return { criteria, result };
        } catch (error) {
          input.failures.push({
            target: `${searchName(criteria)} page ${page}`,
            reason: toMessage(error),
          });
          return null;
        }
      },
    );

    return [...firstPages, ...otherPages].flatMap((page) =>
      page
        ? page.result.groups.map((group) =>
            classifyGroup(page.criteria, group, input.keyword),
          )
        : [],
    );
  }

  private async scrapeCommunity(
    discovered: DiscoveredCommunity,
    state: RunState,
  ) {
    if (state.communities.has(discovered.skoolId)) {
      state.summary.duplicatesInRun += 1;
      return;
    }

    const task = this.fetchAndStoreCommunity(discovered, state);
    state.communities.set(discovered.skoolId, task);

    try {
      await task;
    } catch (error) {
      state.summary.failures.push({
        target: discovered.name,
        reason: toMessage(error),
      });
    }
  }

  private async fetchAndStoreCommunity(
    discovered: DiscoveredCommunity,
    state: RunState,
  ) {
    const { repositories, skoolScraper } = this.context;

    const about = await skoolScraper.about(discovered.name);

    if (!about.owner) {
      throw new Error("Community has no owner");
    }

    const memberCount = about.memberCount || discovered.group.memberCount;
    const pricing = derivePricing(discovered.prices, memberCount);

    if (!matchesFilters(state.filters, { ...pricing, memberCount })) {
      state.summary.filteredOut += 1;
      return;
    }

    const lead = await this.resolveLead(about.owner, state);

    const community = await repositories.community.createIfMissing({
      leadId: lead.leadId,
      skoolId: about.skoolId,
      name: about.name,
      displayName: about.displayName,
      communityUrl: `${SKOOL_URL}/${about.name}`,
      description: about.description ?? discovered.group.description,
      longDescription: about.longDescription,
      memberCount,
      skoolCreatedAt: about.createdAt,
      recentActivity: about.updatedAt,
      membershipQuestions: about.membershipQuestions,
      accessType: discovered.accessType,
      membershipModel:
        about.membershipModel ?? discovered.group.membershipModel,
      plan: about.plan,
      freeTrialEnabled: about.freeTrialEnabled || discovered.freeTrialEnabled,
      logoUrl: about.logoUrl ?? discovered.group.logoUrl,
      coverUrl: about.coverUrl ?? discovered.group.coverUrl,
      freeBenefits: about.freeBenefits,
      tiers: about.tiers,
      links: about.links,
      postCount: about.postCount,
      adminCount: about.adminCount,
      courseCount: about.courseCount,
      moduleCount: about.moduleCount,
      reviewCount: about.reviewCount ?? discovered.group.reviewCount,
      reviewRating: about.reviewRating ?? discovered.group.reviewRating,
      affiliatePercent: about.affiliatePercent,
      discoveryKeyword: discovered.keyword,
      discoverySearch: discovered.search,
      ...pricing,
    });

    if (community) state.summary.communitiesCreated += 1;
    state.leadIds.add(lead.leadId);
  }

  private async resolveLead(owner: SkoolOwner, state: RunState) {
    const running = state.leads.get(owner.username);

    if (running) return await running;

    const task = this.findOrCreateLead(owner, state);
    state.leads.set(owner.username, task);

    return await task;
  }

  private async findOrCreateLead(owner: SkoolOwner, state: RunState) {
    const { repositories, skoolScraper } = this.context;

    const existing = await repositories.lead.findBySkoolUsername({
      skoolUsername: owner.username,
    });

    if (existing) {
      state.summary.leadsReused += 1;
      return existing;
    }

    // The profile adds followers and owned communities; the lead is still worth keeping without it
    const profile = await skoolScraper
      .profile(owner.username)
      .catch((error) => {
        state.summary.failures.push({
          target: `@${owner.username}`,
          reason: toMessage(error),
        });
        return null;
      });

    const created = await repositories.lead.createIfMissing(
      this.toLeadInsert(owner, profile),
    );

    if (created) {
      state.summary.leadsCreated += 1;
      return created;
    }

    const raced = await repositories.lead.findBySkoolUsername({
      skoolUsername: owner.username,
    });

    state.summary.leadsReused += 1;
    return raced!;
  }

  private toLeadInsert(
    aboutOwner: SkoolOwner,
    profile: SkoolProfile | null,
  ): LeadInsert {
    const owner = profile?.owner ?? aboutOwner;

    return {
      skoolUserId: owner.skoolUserId,
      skoolUsername: owner.username,
      name: owner.name,
      firstName: owner.firstName,
      lastName: owner.lastName,
      bio: owner.bio,
      location: owner.location,
      timeZone: owner.timeZone,
      pictureUrl: owner.pictureUrl,
      skoolJoinedAt: owner.joinedAt,
      lastOnlineAt: owner.lastOnlineAt,
      followerCount: profile?.followerCount,
      followingCount: profile?.followingCount,
      postCount: profile?.postCount,
      emails: extractEmails(owner.bio, aboutOwner.bio, owner.email),
      website: owner.website,
      linkedinUrl: owner.linkedinUrl,
      facebookUrl: owner.facebookUrl,
      instagramUrl: owner.instagramUrl,
      twitterUrl: owner.twitterUrl,
      youtubeUrl: owner.youtubeUrl,
      tiktokUrl: owner.tiktokUrl,
      ownedCommunities: profile?.ownedCommunities ?? [],
      profileScrapedAt: profile ? new Date() : null,
    };
  }
}

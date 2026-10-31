import { publishPipelineChanged } from "./pipeline-events";
import { PipelineProgressService } from "./pipeline-progress";
import { BaseService } from "@server/lib/base-service";
import type { Community as ScrapedCommunity } from "@server/lib/base-skool-scrapper";
import type { CommunityInsert } from "@server/infrastructure/database/schemas";
import type {
  DiscoverJob,
  ScrapeFilters,
  ScrapeJob,
  ScrapeRun,
} from "@server/lib/base-queue";
import type { Repositories } from "@server/repositories";
import { describeError } from "@server/lib/utils";

interface StartScrapeInput extends ScrapeFilters {
  search: string;
}

export class ScrapeService extends BaseService {
  public async start(input: StartScrapeInput): Promise<void> {
    await this.context.queueHub.discover.add(input);
  }

  public async discover(input: DiscoverJob): Promise<void> {
    const { runId } = input;

    if (runId !== undefined && (await this.resume(input, runId))) return;

    const communities = await this.context.skoolScrapper.discover({
      search: input.search,
    });

    const matching = [
      ...new Map(
        communities
          .filter((community) => this.matchesFilters(community, input))
          .map((community) => [community.communityURL, community]),
      ).values(),
    ];

    const stored = await this.context.repositories.community.findAllBySkoolUrls(
      { skoolUrls: matching.map((community) => community.communityURL) },
    );
    const storedUrls = new Set(stored.map((community) => community.skoolUrl));
    const fresh = matching
      .filter((community) => !storedUrls.has(community.communityURL))
      .map((community) => community.communityURL);

    if (input.campaignId !== undefined) {
      await this.linkToCampaign({
        campaignId: input.campaignId,
        leadIds: stored.map((community) => community.leadId),
        communityIds: stored.map((community) => community.communityId),
      });
    }

    if (runId === undefined) {
      await this.queueCommunities(input, fresh);
      return;
    }

    const settled = await this.context.repositories.transaction(
      async ({ tx }) => {
        const run = await tx.pipelineRun.lockByRunId({ runId });
        if (!run || run.itemsReady || run.status === "failed") return null;
        const keyword = await tx.pipelineRun.findKeyword({
          runId,
          keyword: input.search,
        });
        if (keyword?.status === "done") return null;

        const created = await tx.pipelineRun.createItems({
          runId,
          itemKeys: matching.map((community) => community.communityURL),
        });
        await tx.pipelineRun.markKeyword({
          runId,
          keyword: input.search,
          status: "done",
        });
        await this.settleRun(tx, runId);

        return { campaignId: run.campaignId, created: new Set(created) };
      },
    );

    if (settled === null) return;

    await publishPipelineChanged(this.context, settled.campaignId);

    const progress = new PipelineProgressService({ context: this.context });
    for (const community of stored) {
      await progress.complete(
        { runId, itemKey: community.skoolUrl, status: "processed" },
        async () => ({ leadId: community.leadId }),
      );
    }

    await this.queueCommunities(
      input,
      fresh.filter((communityURL) => settled.created.has(communityURL)),
    );
  }

  // A retried job for a finished keyword only re-queues its unfinished items
  private async resume(input: DiscoverJob, runId: number): Promise<boolean> {
    const { pipelineRun } = this.context.repositories;
    const run = await pipelineRun.findByRunId({ runId });
    if (!run || run.status === "failed") return true;

    const keyword = await pipelineRun.findKeyword({
      runId,
      keyword: input.search,
    });
    if (!run.itemsReady && keyword?.status !== "done") return false;

    const items = await pipelineRun.findItems({ runId });
    await this.queueCommunities(
      input,
      items
        .filter((item) => item.status !== "processed")
        .map((item) => item.itemKey),
    );

    return true;
  }

  private async settleRun(tx: Repositories, runId: number): Promise<void> {
    const keywords = await tx.pipelineRun.findKeywords({ runId });

    if (keywords.some((keyword) => keyword.status === "pending")) {
      await tx.pipelineRun.syncTotal({ runId });
      return;
    }

    const failed = keywords.filter((keyword) => keyword.status === "failed");
    const reasons = failed.map((keyword) =>
      keywords.length === 1
        ? (keyword.error ?? "")
        : `${keyword.keyword}: ${keyword.error ?? ""}`,
    );

    if (failed.length === keywords.length) {
      await tx.pipelineRun.markFailed({ runId, error: reasons.join("; ") });
      return;
    }

    const items = await tx.pipelineRun.findItems({ runId });
    await tx.pipelineRun.initializeItems({
      runId,
      total: items.length,
      error:
        failed.length > 0
          ? `Search failed for ${reasons.join("; ")}`
          : undefined,
    });
    await tx.pipelineRun.refreshProgress({ runId });
  }

  public async recordDiscoverFailure(
    job: DiscoverJob,
    error: unknown,
  ): Promise<void> {
    const { runId } = job;
    if (runId === undefined) return;

    const campaignId = await this.context.repositories.transaction(
      async ({ tx }) => {
        const run = await tx.pipelineRun.lockByRunId({ runId });
        if (!run || run.itemsReady || run.status === "failed") return null;
        const keyword = await tx.pipelineRun.findKeyword({
          runId,
          keyword: job.search,
        });
        if (keyword?.status !== "pending") return null;

        await tx.pipelineRun.markKeyword({
          runId,
          keyword: job.search,
          status: "failed",
          error: describeError(error),
        });
        await this.settleRun(tx, runId);

        return run.campaignId;
      },
    );

    if (campaignId !== null)
      await publishPipelineChanged(this.context, campaignId);
  }

  private async queueCommunities(input: ScrapeRun, urls: string[]) {
    await Promise.all(
      urls.map((communityURL) =>
        this.context.queueHub.scrape.add(
          {
            type: "scrape-community",
            communityURL,
            runId: input.runId,
            campaignId: input.campaignId,
          },
          input.runId === undefined
            ? undefined
            : {
                idempotencyKey: `scrape-${input.runId}-${encodeURIComponent(communityURL)}`,
              },
        ),
      ),
    );
  }

  public async recordFailure(job: ScrapeJob, error: unknown): Promise<void> {
    if (job.runId === undefined) {
      return;
    }

    await new PipelineProgressService({ context: this.context }).complete({
      runId: job.runId,
      itemKey:
        job.type === "scrape-community"
          ? job.communityURL
          : job.community.communityURL,
      status: "failed",
      error: describeError(error),
    });
  }

  public async scrapeCommunity(
    input: { communityURL: string } & ScrapeRun,
  ): Promise<void> {
    const about = await this.context.skoolScrapper.about({
      communityURL: input.communityURL,
    });

    if (!about) {
      void this.context.logger.warn({
        message: "Skool community not found, skipped.",
        communityURL: input.communityURL,
      });
      await this.finishItem(input, input.communityURL);
      return;
    }

    const { leadURL, ...community } = about;

    await this.context.queueHub.scrape.add({
      type: "scrape-lead",
      leadURL,
      community,
      runId: input.runId,
      campaignId: input.campaignId,
    });
  }

  public async scrapeLead(
    input: {
      leadURL: string;
      community: ScrapedCommunity;
    } & ScrapeRun,
  ): Promise<void> {
    const lead = await this.context.skoolScrapper.lead({
      leadURL: input.leadURL,
    });

    if (!lead) {
      void this.context.logger.warn({
        message: "Skool lead not found, community skipped.",
        leadURL: input.leadURL,
        communityURL: input.community.communityURL,
      });
      await this.finishItem(input, input.community.communityURL);
      return;
    }

    await new PipelineProgressService({ context: this.context }).complete(
      {
        runId: input.runId,
        itemKey: input.community.communityURL,
        status: "processed",
      },
      async (tx) => {
        const saved = await tx.lead.upsertBySkoolUrl({
          name: lead.name,
          username: lead.username,
          skoolUrl: lead.leadURL,
          bio: lead.bio,
          instagram: lead.instagram,
          facebook: lead.facebook,
          linkedin: lead.linkedin,
          website: lead.website,
          pictureUrl: lead.pictureUrl,
        });

        await tx.leadEmail.addMany({
          leadId: saved.leadId,
          addresses: lead.email ? [lead.email] : [],
          source: "skool",
        });

        const community = await tx.community.upsertBySkoolUrl(
          this.toCommunityInsert(input.community, saved.leadId),
        );

        if (input.campaignId !== undefined) {
          await tx.campaign.addLeads({
            campaignId: input.campaignId,
            leadIds: [saved.leadId],
          });
          await tx.campaign.addCommunities({
            campaignId: input.campaignId,
            communityIds: [community.communityId],
          });
        }

        return { leadId: saved.leadId };
      },
    );
  }

  private async finishItem(input: ScrapeRun, itemKey: string): Promise<void> {
    if (input.runId === undefined) return;
    await new PipelineProgressService({ context: this.context }).complete({
      runId: input.runId,
      itemKey,
      status: "processed",
    });
  }

  private async linkToCampaign(input: {
    campaignId: number;
    leadIds: number[];
    communityIds: number[];
  }): Promise<void> {
    if (input.communityIds.length === 0) {
      return;
    }

    const { campaign } = this.context.repositories;

    await campaign.addLeads({
      campaignId: input.campaignId,
      leadIds: [...new Set(input.leadIds)],
    });
    await campaign.addCommunities({
      campaignId: input.campaignId,
      communityIds: input.communityIds,
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
      thumbnailUrl: community.thumbnailUrl,
      logoUrl: community.logoUrl,
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

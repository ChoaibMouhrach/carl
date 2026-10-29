import { BaseService } from "@server/lib/base-service";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "@server/lib/errors";
import { describeError } from "@server/lib/utils";
import type { PipelineRun } from "@server/infrastructure/database/schemas";

const UNIQUE_VIOLATION = "23505";

const isUniqueViolation = (error: unknown): boolean => {
  const code =
    error instanceof Error && error.cause instanceof Error
      ? Reflect.get(error.cause, "code")
      : undefined;

  return code === UNIQUE_VIOLATION;
};

export class PipelineService extends BaseService {
  public async get(where: { campaignId: number }) {
    await this.requireCampaign(where);

    const { pipelineRun, lead } = this.context.repositories;

    const [scrape, enrich] = await Promise.all([
      pipelineRun.findLatest({ ...where, step: "scrape" }),
      pipelineRun.findLatest({ ...where, step: "enrich" }),
    ]);

    const [scrapedCount, contactableCount] = await Promise.all([
      lead.countResultsByRunId({
        ...where,
        runId: scrape?.runId ?? null,
        contactable: false,
      }),
      lead.countResultsByRunId({
        ...where,
        runId: enrich?.runId ?? null,
        contactable: true,
      }),
    ]);
    return {
      scrape,
      enrich,
      scrapedCount,
      enrichmentAvailable: this.context.webSearch.isAvailable,
      contactableCount,
    };
  }

  public async startScrape(where: {
    campaignId: number;
  }): Promise<PipelineRun> {
    const campaign = await this.requireCampaign(where);

    if (!campaign.isActive) {
      throw new BadRequestError({
        message: "The campaign is inactive.",
        code: "campaignInactive",
      });
    }

    const run = await this.createRun({ ...where, step: "scrape" });

    try {
      await this.context.queueHub.scrape.add({
        type: "discover",
        search: campaign.keyword,
        minPrice:
          campaign.minPriceCents === null
            ? undefined
            : campaign.minPriceCents / 100,
        minMembers: campaign.minMembers ?? undefined,
        runId: run.runId,
        campaignId: campaign.campaignId,
      });
    } catch (error) {
      await this.context.repositories.pipelineRun.markFailed({
        runId: run.runId,
        error: describeError(error),
      });
      throw error;
    }

    return run;
  }

  public async startEnrich(where: {
    campaignId: number;
  }): Promise<PipelineRun> {
    await this.requireCampaign(where);

    const { pipelineRun, lead } = this.context.repositories;

    if (!this.context.webSearch.isAvailable) {
      throw new BadRequestError({
        message: "Lead enrichment is not configured.",
        code: "enrichmentUnavailable",
      });
    }

    const [runningScrape, finishedScrape] = await Promise.all([
      pipelineRun.findRunning({ ...where, step: "scrape" }),
      pipelineRun.findLatestDone({ ...where, step: "scrape" }),
    ]);

    if (runningScrape || !finishedScrape || !finishedScrape.itemsReady) {
      throw new BadRequestError({
        message:
          "Run a scrape to collect tracked results before enriching its leads.",
        code: "scrapeRequired",
      });
    }

    const run = await this.createRun({ ...where, step: "enrich" });

    try {
      const leadIds = await lead.findLeadIdsByRunId({
        runId: finishedScrape.runId,
        campaignId: where.campaignId,
      });

      await this.context.repositories.transaction(async ({ tx }) => {
        await tx.pipelineRun.lockByRunId({ runId: run.runId });
        await tx.pipelineRun.createItems({
          runId: run.runId,
          itemKeys: leadIds.map((leadId) => `lead:${leadId}`),
        });
        await tx.pipelineRun.initializeItems({
          runId: run.runId,
          total: leadIds.length,
        });
      });

      await Promise.all(
        leadIds.map(
          async (leadId) =>
            await this.context.queueHub.enrich.add(
              { type: "enrich-lead", runId: run.runId, leadId },
              { idempotencyKey: `enrich-${run.runId}-${leadId}` },
            ),
        ),
      );
    } catch (error) {
      await pipelineRun.markFailed({
        runId: run.runId,
        error: describeError(error),
      });
      throw error;
    }

    return run;
  }

  private async requireCampaign(where: { campaignId: number }) {
    const campaign =
      await this.context.repositories.campaign.findByCampaignId(where);

    if (!campaign) {
      throw new NotFoundError({
        message: "Campaign not found.",
        code: "campaignNotFound",
      });
    }

    return campaign;
  }

  private async createRun(input: {
    campaignId: number;
    step: "scrape" | "enrich";
  }): Promise<PipelineRun> {
    const { pipelineRun } = this.context.repositories;

    if (await pipelineRun.findRunning(input)) {
      throw this.inProgress();
    }

    try {
      return await pipelineRun.create(input);
    } catch (error) {
      throw isUniqueViolation(error) ? this.inProgress() : error;
    }
  }

  private inProgress() {
    return new ConflictError({
      message: "That step is already running for this campaign.",
      code: "pipelineRunInProgress",
    });
  }
}

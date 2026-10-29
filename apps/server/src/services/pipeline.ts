import { BaseService } from "@server/lib/base-service";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "@server/lib/errors";
import { pipelineTopic } from "@server/lib/base-pubsub";
import { describeError } from "@server/lib/utils";
import { publishPipelineChanged } from "./pipeline-events";
import type {
  PipelineRun,
  PipelineStep,
} from "@server/infrastructure/database/schemas";

const UNIQUE_VIOLATION = "23505";

const isUniqueViolation = (error: unknown): boolean => {
  const code =
    error instanceof Error && error.cause instanceof Error
      ? Reflect.get(error.cause, "code")
      : undefined;

  return code === UNIQUE_VIOLATION;
};

export type PipelineState = Awaited<ReturnType<PipelineService["get"]>>;

export class PipelineService extends BaseService {
  public async get(where: { campaignId: number }) {
    await this.requireCampaign(where);

    const { pipelineRun, lead } = this.context.repositories;

    const [scrape, enrich, fullenrich] = await Promise.all([
      pipelineRun.findLatest({ ...where, step: "scrape" }),
      pipelineRun.findLatest({ ...where, step: "enrich" }),
      pipelineRun.findLatest({ ...where, step: "fullenrich" }),
    ]);

    const [scrapedCount, contactableCount, emailedCount] = await Promise.all([
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
      lead.countEmailedByRunId({
        ...where,
        runId: fullenrich?.runId ?? null,
      }),
    ]);
    return {
      scrape,
      enrich,
      fullenrich,
      scrapedCount,
      enrichmentAvailable: this.context.webSearch.isAvailable,
      contactableCount,
      emailEnrichmentAvailable: this.context.contactEnrichment.isAvailable,
      emailedCount,
    };
  }

  public async watch(
    where: { campaignId: number },
    signal: AbortSignal,
  ): Promise<AsyncGenerator<PipelineState>> {
    await this.requireCampaign(where);

    let isDirty = true;
    const waiters: Array<() => void> = [];
    const wakeAll = () => {
      for (const waiter of waiters.splice(0)) waiter();
    };

    const unsubscribe = await this.context.pubSub.pipeline.subscribe(
      pipelineTopic(where.campaignId),
      () => {
        isDirty = true;
        wakeAll();
      },
    );
    signal.addEventListener("abort", wakeAll, { once: true });

    const load = () => this.get(where);

    return (async function* () {
      try {
        while (!signal.aborted) {
          if (!isDirty) {
            await new Promise<void>((resolve) => waiters.push(resolve));
            continue;
          }
          isDirty = false;
          yield await load();
        }
      } finally {
        await unsubscribe();
      }
    })();
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
      await publishPipelineChanged(this.context, where.campaignId);
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

    return await this.startLeadRun({
      ...where,
      step: "enrich",
      findLeadIds: async () =>
        await lead.findLeadIdsByRunId({
          runId: finishedScrape.runId,
          campaignId: where.campaignId,
        }),
      enqueue: async ({ runId, leadId }) =>
        await this.context.queueHub.enrich.add(
          { type: "enrich-lead", runId, leadId },
          { idempotencyKey: `enrich-${runId}-${leadId}` },
        ),
    });
  }

  public async startFullEnrich(where: {
    campaignId: number;
  }): Promise<PipelineRun> {
    await this.requireCampaign(where);

    const { pipelineRun, lead } = this.context.repositories;

    if (!this.context.contactEnrichment.isAvailable) {
      throw new BadRequestError({
        message: "Email enrichment is not configured.",
        code: "emailEnrichmentUnavailable",
      });
    }

    const [runningEnrich, finishedEnrich] = await Promise.all([
      pipelineRun.findRunning({ ...where, step: "enrich" }),
      pipelineRun.findLatestDone({ ...where, step: "enrich" }),
    ]);

    if (runningEnrich || !finishedEnrich || !finishedEnrich.itemsReady) {
      throw new BadRequestError({
        message:
          "Run a lead enrichment to find websites and LinkedIn profiles before looking up emails.",
        code: "enrichRequired",
      });
    }

    return await this.startLeadRun({
      ...where,
      step: "fullenrich",
      findLeadIds: async () =>
        await lead.findLeadIdsByRunId({
          runId: finishedEnrich.runId,
          campaignId: where.campaignId,
          contactable: true,
        }),
      enqueue: async ({ runId, leadId }) =>
        await this.context.queueHub.fullenrich.add(
          { type: "fullenrich-lead", runId, leadId },
          { idempotencyKey: `fullenrich-${runId}-${leadId}` },
        ),
    });
  }

  private async startLeadRun(input: {
    campaignId: number;
    step: "enrich" | "fullenrich";
    findLeadIds: () => Promise<number[]>;
    enqueue: (job: { runId: number; leadId: number }) => Promise<void>;
  }): Promise<PipelineRun> {
    const { campaignId, step } = input;
    const run = await this.createRun({ campaignId, step });

    try {
      const leadIds = await input.findLeadIds();

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
      await publishPipelineChanged(this.context, campaignId);

      await Promise.all(
        leadIds.map(
          async (leadId) => await input.enqueue({ runId: run.runId, leadId }),
        ),
      );
    } catch (error) {
      await this.context.repositories.pipelineRun.markFailed({
        runId: run.runId,
        error: describeError(error),
      });
      await publishPipelineChanged(this.context, campaignId);
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
    step: PipelineStep;
  }): Promise<PipelineRun> {
    const { pipelineRun } = this.context.repositories;

    if (await pipelineRun.findRunning(input)) {
      throw this.inProgress();
    }

    try {
      const run = await pipelineRun.create(input);
      await publishPipelineChanged(this.context, input.campaignId);
      return run;
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

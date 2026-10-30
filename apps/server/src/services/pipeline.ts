import { BaseService } from "@server/lib/base-service";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "@server/lib/errors";
import { pipelineTopic } from "@server/lib/base-pubsub";
import { describeError } from "@server/lib/utils";
import type { EligibleStep } from "@server/repositories/lead";
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

    const [scrape, enrich, website, fullenrich, funnel] = await Promise.all([
      pipelineRun.findLatest({ ...where, step: "scrape" }),
      pipelineRun.findLatest({ ...where, step: "enrich" }),
      pipelineRun.findLatest({ ...where, step: "website" }),
      pipelineRun.findLatest({ ...where, step: "fullenrich" }),
      lead.findFunnel(where),
    ]);

    return {
      scrape,
      enrich,
      website,
      fullenrich,
      funnel,
      enrichmentAvailable: this.context.webSearch.isAvailable,
      emailEnrichmentAvailable: this.context.contactEnrichment.isAvailable,
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

  public async startEnrich(
    where: { campaignId: number },
    options: { includeProcessed: boolean },
  ): Promise<PipelineRun> {
    await this.requireCampaign(where);

    if (!this.context.webSearch.isAvailable) {
      throw new BadRequestError({
        message: "Lead enrichment is not configured.",
        code: "enrichmentUnavailable",
      });
    }

    return await this.startLeadRun({
      ...where,
      step: "enrich",
      includeProcessed: options.includeProcessed,
      enqueue: async ({ runId, leadId }) =>
        await this.context.queueHub.enrich.add(
          { type: "enrich-lead", runId, leadId },
          { idempotencyKey: `enrich-${runId}-${leadId}` },
        ),
    });
  }

  public async startWebsite(
    where: { campaignId: number },
    options: { includeProcessed: boolean },
  ): Promise<PipelineRun> {
    await this.requireCampaign(where);

    return await this.startLeadRun({
      ...where,
      step: "website",
      includeProcessed: options.includeProcessed,
      enqueue: async ({ runId, leadId }) =>
        await this.context.queueHub.website.add(
          { type: "website-lead", runId, leadId },
          { idempotencyKey: `website-${runId}-${leadId}` },
        ),
    });
  }

  public async startFullEnrich(
    where: { campaignId: number },
    options: { includeProcessed: boolean },
  ): Promise<PipelineRun> {
    await this.requireCampaign(where);

    if (!this.context.contactEnrichment.isAvailable) {
      throw new BadRequestError({
        message: "Email enrichment is not configured.",
        code: "emailEnrichmentUnavailable",
      });
    }

    return await this.startLeadRun({
      ...where,
      step: "fullenrich",
      includeProcessed: options.includeProcessed,
      enqueue: async ({ runId, leadId }) =>
        await this.context.queueHub.fullenrich.add(
          { type: "fullenrich-lead", runId, leadId },
          { idempotencyKey: `fullenrich-${runId}-${leadId}` },
        ),
    });
  }

  private async startLeadRun(input: {
    campaignId: number;
    step: EligibleStep;
    includeProcessed: boolean;
    enqueue: (job: { runId: number; leadId: number }) => Promise<void>;
  }): Promise<PipelineRun> {
    const { campaignId, step } = input;
    const run = await this.createRun({ campaignId, step });

    try {
      const leadIds = await this.context.repositories.lead.findEligibleLeadIds({
        campaignId,
        step,
        includeProcessed: input.includeProcessed,
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

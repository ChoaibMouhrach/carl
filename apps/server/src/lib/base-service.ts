import type { StageNumber } from "@repo/constants/campaign";
import type { Context } from "@server/context";
import type { BaseQueue } from "./base-queue";
import { ConflictError } from "./errors";

export abstract class BaseService {
  protected context;

  public constructor(init: { context: Context }) {
    this.context = init.context;
  }

  /** Refuses while the campaign's stage has a job queued or running; leads left running by a run that died are put back in the queue instead */
  protected async refuseWhileRunning(input: {
    campaignId: number;
    stage: StageNumber;
    queue: BaseQueue<{ campaignId: number }>;
    message: string;
  }) {
    const { campaignLead } = this.context.repositories;
    const where = { campaignId: input.campaignId, stage: input.stage };
    const running = await campaignLead.countAtStageWithStatus({
      ...where,
      status: "running",
    });

    if (running === 0) return;

    const hasJob = await input.queue.hasJob(
      (job) => job.campaignId === input.campaignId,
    );

    if (hasJob) throw new ConflictError({ message: input.message });

    const recovered = await campaignLead.requeueRunning(where);

    await this.context.logger.warn({
      message: "Leads left running by a run that died were queued again.",
      ...where,
      recovered,
    });
  }
}

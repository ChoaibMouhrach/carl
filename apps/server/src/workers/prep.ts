import { ZodError } from "zod";
import { BaseWorker } from "@server/lib/base-worker";
import { NonRetryableJobError } from "@server/lib/base-queue";
import { PrepService } from "@server/services/prep";

export class PrepWorker extends BaseWorker {
  public override async run(): Promise<void> {
    this.context.logger.info("The prep worker is running.");

    const prep = new PrepService({ context: this.context });

    await this.context.queueHub.prep.consume(async (job, meta) => {
      try {
        await prep.prepLead(job);
      } catch (error) {
        const classified =
          error instanceof ZodError
            ? new NonRetryableJobError(error.message, { cause: error })
            : error;

        if (meta.isFinalAttempt || classified instanceof NonRetryableJobError) {
          await prep.recordFailure({
            runId: job.runId,
            leadId: job.leadId,
            error: classified,
          });
        }

        throw classified;
      }
    });
  }
}

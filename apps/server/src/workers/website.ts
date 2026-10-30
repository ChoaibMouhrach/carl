import { ZodError } from "zod";
import { BaseWorker } from "@server/lib/base-worker";
import { NonRetryableJobError } from "@server/lib/base-queue";
import { WebsiteEmailService } from "@server/services/website-email";

export class WebsiteWorker extends BaseWorker {
  public override async run(): Promise<void> {
    this.context.logger.info("The website worker is running.");

    const websiteEmail = new WebsiteEmailService({ context: this.context });

    await this.context.queueHub.website.consume(async (job, meta) => {
      try {
        await websiteEmail.scrapeLead(job);
      } catch (error) {
        const classified =
          error instanceof ZodError
            ? new NonRetryableJobError(error.message, { cause: error })
            : error;

        if (meta.isFinalAttempt || classified instanceof NonRetryableJobError) {
          await websiteEmail.recordFailure({
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

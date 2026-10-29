import { ZodError } from "zod";
import { BaseWorker } from "@server/lib/base-worker";
import { NonRetryableJobError } from "@server/lib/base-queue";
import { ContactEnrichmentError } from "@server/lib/base-contact-enrichment";
import { FullEnrichService } from "@server/services/fullenrich";

export class FullEnrichWorker extends BaseWorker {
  public override async run(): Promise<void> {
    this.context.logger.info("The fullenrich worker is running.");

    const fullenrich = new FullEnrichService({ context: this.context });

    await this.context.queueHub.fullenrich.consume(async (job, meta) => {
      try {
        await fullenrich.enrichLead(job);
      } catch (error) {
        const classified = this.classify(error);

        if (meta.isFinalAttempt || classified instanceof NonRetryableJobError) {
          await fullenrich.recordFailure({
            runId: job.runId,
            leadId: job.leadId,
            error: classified,
          });
        }

        throw classified;
      }
    });
  }

  private classify(error: unknown): unknown {
    if (error instanceof ZodError) {
      return new NonRetryableJobError(error.message, { cause: error });
    }

    if (error instanceof ContactEnrichmentError && !error.retryable) {
      return new NonRetryableJobError(error.message, { cause: error });
    }

    return error;
  }
}

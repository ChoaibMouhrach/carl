import { ZodError } from "zod";
import { BaseWorker } from "@server/lib/base-worker";
import { NonRetryableJobError } from "@server/lib/base-queue";
import { WebSearchError } from "@server/lib/base-web-search";
import { EnrichService } from "@server/services/enrich";

export class EnrichWorker extends BaseWorker {
  public override async run(): Promise<void> {
    this.context.logger.info("The enrich worker is running.");

    const enrich = new EnrichService({ context: this.context });

    await this.context.queueHub.enrich.consume(async (job, meta) => {
      try {
        await enrich.enrichLead(job);
      } catch (error) {
        const classified = this.classify(error);

        if (meta.isFinalAttempt || classified instanceof NonRetryableJobError) {
          await enrich.recordFailure({ runId: job.runId, error: classified });
        }

        throw classified;
      }
    });
  }

  private classify(error: unknown): unknown {
    if (error instanceof ZodError) {
      return new NonRetryableJobError(error.message, { cause: error });
    }

    if (error instanceof WebSearchError && !error.retryable) {
      return new NonRetryableJobError(error.message, { cause: error });
    }

    return error;
  }
}

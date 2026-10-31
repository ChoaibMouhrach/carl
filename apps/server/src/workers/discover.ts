import { ZodError } from "zod";
import { BaseWorker } from "@server/lib/base-worker";
import { NonRetryableJobError } from "@server/lib/base-queue";
import { SkoolScrapeError } from "@server/lib/base-skool-scrapper";
import { ScrapeService } from "@server/services/scrape";

export class DiscoverWorker extends BaseWorker {
  public override async run(): Promise<void> {
    this.context.logger.info("The discover worker is running.");

    const scrape = new ScrapeService({ context: this.context });

    await this.context.queueHub.discover.consume(async (job, meta) => {
      try {
        await scrape.discover(job);
      } catch (error) {
        const classified = this.classify(error);

        if (meta.isFinalAttempt || classified instanceof NonRetryableJobError) {
          await scrape.recordDiscoverFailure(job, classified);
        }

        throw classified;
      }
    });
  }

  // Retrying cannot fix a changed page shape, only a blocked or flaky request
  private classify(error: unknown): unknown {
    if (error instanceof ZodError) {
      return new NonRetryableJobError(error.message, { cause: error });
    }

    if (error instanceof SkoolScrapeError && !error.retryable) {
      return new NonRetryableJobError(error.message, { cause: error });
    }

    return error;
  }
}

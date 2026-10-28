import { ZodError } from "zod";
import { BaseWorker } from "@server/lib/base-worker";
import { NonRetryableJobError, type ScrapeJob } from "@server/lib/base-queue";
import { SkoolScrapeError } from "@server/lib/base-skool-scrapper";
import { ScrapeService } from "@server/services/scrape";

export class ScrapeWorker extends BaseWorker {
  public override async run(): Promise<void> {
    this.context.logger.info("The scrape worker is running.");

    const scrape = new ScrapeService({ context: this.context });

    await this.context.queueHub.scrape.consume(async (job, meta) => {
      try {
        await this.handle(scrape, job);
      } catch (error) {
        const classified = this.classify(error);

        if (meta.isFinalAttempt || classified instanceof NonRetryableJobError) {
          await scrape.recordFailure(job, classified);
        }

        throw classified;
      }
    });
  }

  private async handle(scrape: ScrapeService, job: ScrapeJob): Promise<void> {
    switch (job.type) {
      case "discover":
        await scrape.discover(job);
        return;
      case "scrape-community":
        await scrape.scrapeCommunity(job);
        return;
      case "scrape-lead":
        await scrape.scrapeLead(job);
        return;
    }
  }

  // Retrying cannot fix a changed page shape or a bad URL, only a blocked or flaky request
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

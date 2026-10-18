import { BaseWorker } from "@server/lib/base-worker";
import { Services } from "@server/services";

export class ScrapeWorker extends BaseWorker {
  public override async run(): Promise<void> {
    this.context.logger.info("The scrape worker is running.");

    const services = new Services({ context: this.context });

    await this.context.queueHub.scrape.consume(async (job) => {
      await services.scrape.runCampaign({ scrapeRunId: job.scrapeRunId });
    });
  }
}

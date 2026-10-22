import { BaseWorker } from "@server/lib/base-worker";
import { Services } from "@server/services";

export class EnrichWorker extends BaseWorker {
  public override async run(): Promise<void> {
    await this.context.logger.info({
      message: "The enrich worker is running.",
      webSearch: this.context.webSearch.provider,
    });

    const services = new Services({ context: this.context });

    await this.context.queueHub.enrich.consume(async (job) => {
      await services.enrich.runCampaign({ campaignId: job.campaignId });
    });
  }
}

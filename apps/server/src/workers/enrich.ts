import { BaseWorker } from "@server/lib/base-worker";
import { Services } from "@server/services";

export class EnrichWorker extends BaseWorker {
  public override async run(): Promise<void> {
    this.context.logger.info("The enrich worker is running.");

    const services = new Services({ context: this.context });

    await this.context.queueHub.enrich.consume(async (job) => {
      await services.enrich.runCampaign({ campaignId: job.campaignId });
    });
  }
}

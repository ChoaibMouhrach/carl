import { BaseWorker } from "@server/lib/base-worker";
import { Services } from "@server/services";

export class FilterWorker extends BaseWorker {
  public override async run(): Promise<void> {
    this.context.logger.info("The filter worker is running.");

    const services = new Services({ context: this.context });

    await this.context.queueHub.filter.consume(async (job) => {
      await services.filter.runCampaign({ campaignId: job.campaignId });
    });
  }
}

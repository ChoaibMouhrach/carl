import { BaseWorker } from "@server/lib/base-worker";
import { Services } from "@server/services";

export class FindEmailWorker extends BaseWorker {
  public override async run(): Promise<void> {
    await this.context.logger.info({
      message: "The find email worker is running.",
      emailFinder: this.context.emailFinder.provider,
    });

    const services = new Services({ context: this.context });

    await this.context.queueHub.findEmail.consume(async (job) => {
      await services.findEmail.runCampaign({ campaignId: job.campaignId });
    });
  }
}

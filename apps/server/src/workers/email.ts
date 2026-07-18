import { BaseWorker } from "@server/lib/base-worker";

export class EmailWorker extends BaseWorker {
  public override async run(): Promise<void> {
    this.context.logger.info("The email worker is running.");

    await this.context.queueHub.email.consume(async (message) => {
      await this.context.mailer.email(message);
    });
  }
}

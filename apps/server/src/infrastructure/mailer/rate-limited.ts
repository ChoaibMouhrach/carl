import { BaseMailer, type SendEmailProps } from "@server/lib/base-mailer";

interface RateLimitedMailerInit {
  intervalMs: number;
  mailer: BaseMailer;
}

export class RateLimitedMailer extends BaseMailer {
  private intervalMs: number;
  private mailer: BaseMailer;
  private nextAvailableAt = 0;
  private pending: Promise<void> = Promise.resolve();

  public constructor(init: RateLimitedMailerInit) {
    super();
    this.intervalMs = init.intervalMs;
    this.mailer = init.mailer;
  }

  public override async email<From extends string>(
    props: SendEmailProps<From>,
  ): Promise<void> {
    const send = this.pending.then(async () => {
      const now = Date.now();
      const availableAt = Math.max(now, this.nextAvailableAt);
      const delay = availableAt - now;

      this.nextAvailableAt = availableAt + this.intervalMs;

      if (delay > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, delay);
        });
      }

      await this.mailer.email(props);
    });

    this.pending = send.catch(() => undefined);

    await send;
  }
}

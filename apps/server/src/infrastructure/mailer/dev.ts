import type { BaseLogger } from "@server/lib/base-logger";
import { BaseMailer, type SendEmailProps } from "@server/lib/base-mailer";

export class DevMailer extends BaseMailer {
  private logger;

  public constructor(init: { logger: BaseLogger }) {
    super();
    this.logger = init.logger;
  }

  public override async email<From extends string>(
    props: SendEmailProps<From>,
  ) {
    this.logger.info(props);
  }

  public override async verify(): Promise<void> {}
}

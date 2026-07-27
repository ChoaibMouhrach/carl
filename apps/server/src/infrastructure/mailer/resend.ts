import { Resend } from "resend";
import { BaseMailer, type SendEmailProps } from "@server/lib/base-mailer";

interface ResendMailerInit {
  apiKey: string;
  domain: string;
}

export class ResendMailer extends BaseMailer {
  private client: Resend;
  private domain: string;

  public constructor(init: ResendMailerInit) {
    super();
    this.client = new Resend(init.apiKey);
    this.domain = init.domain;
  }

  public override async email<From extends string>(
    props: SendEmailProps<From>,
  ) {
    const { error } = await this.client.emails.send({
      from: `${props.from}@${this.domain}`,
      to: props.to,
      subject: props.subject,
      html: props.html,
      replyTo: props.replyTo,
    });

    if (error) {
      throw new Error(`Resend email failed: ${error.message}`);
    }
  }

  public override async verify(): Promise<void> {
    const { error } = await this.client.domains.list();

    if (error) {
      throw new Error(`Resend verification failed: ${error.message}`);
    }
  }
}

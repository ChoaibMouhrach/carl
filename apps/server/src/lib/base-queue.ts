import type { SendEmailProps } from "./base-mailer";

export type EmailSender = "auth" | "notifications";

export type EmailJob = SendEmailProps<EmailSender>;

export abstract class BaseQueue<Input> {
  public abstract add(input: Input): Promise<void>;

  public abstract close(): Promise<void>;
}

export abstract class BaseQueueHub {
  public abstract email: BaseQueue<EmailJob>;

  public abstract close(): Promise<void>;
}

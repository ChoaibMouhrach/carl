export type NotEmail<T extends string> =
  T extends `${string}@${string}.${string}` ? never : T;

export interface SendEmailProps<From extends string> {
  to: string[];
  from: NotEmail<From>;
  subject: string;
  html: string;
  replyTo?: string;
}

export abstract class BaseMailer {
  public abstract email<From extends string>(
    props: SendEmailProps<From>,
  ): Promise<void>;

  public abstract verify(): Promise<void>;
}

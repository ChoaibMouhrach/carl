import type { SendEmailProps } from "./base-mailer";

export type EmailSender = "auth";

export type EmailJob = SendEmailProps<EmailSender>;

export type ScrapeJob = { scrapeRunId: number };

export type FilterJob = { campaignId: number };

export type EnrichJob = { campaignId: number };

export type FindEmailJob = { campaignId: number };

export type MaintenanceJob =
  | { type: "check-queue-backlog" }
  | { type: "sweep-email-batches" };

export type QueueConsumer<Input> = (input: Input) => Promise<void>;

export interface AddJobOptions {
  idempotencyKey?: string;
}

export interface ScheduleJobOptions<Input> {
  schedulerId: string;
  pattern: string;
  data: Input;
}

export interface QueueJobCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

export interface FailedJob {
  id: string;
  name: string;
  data: unknown;
  failedReason: string;
  attemptsMade: number;
  timestamp: number;
  processedOn: number | null;
  stacktrace: string[];
}

export interface ListFailedInput {
  start: number;
  end: number;
}

export interface ListFailedResult {
  jobs: FailedJob[];
  total: number;
}

export abstract class BaseQueue<Input> {
  public abstract add(input: Input, options?: AddJobOptions): Promise<void>;

  public abstract schedule(options: ScheduleJobOptions<Input>): Promise<void>;

  public abstract consume(consumer: QueueConsumer<Input>): Promise<void>;

  public abstract getCounts(): Promise<QueueJobCounts>;

  /** Whether a job that has not finished yet (queued, delayed or running) matches */
  public abstract hasJob(matches: (input: Input) => boolean): Promise<boolean>;

  public abstract listFailed(input: ListFailedInput): Promise<ListFailedResult>;

  public abstract retry(jobId: string): Promise<boolean>;

  public abstract retryAllFailed(): Promise<number>;

  public abstract remove(jobId: string): Promise<boolean>;

  public abstract close(): Promise<void>;
}

export interface RegisteredQueue {
  name: string;
  queue: BaseQueue<unknown>;
}

export abstract class BaseQueueHub {
  public abstract email: BaseQueue<EmailJob>;
  public abstract maintenance: BaseQueue<MaintenanceJob>;
  public abstract scrape: BaseQueue<ScrapeJob>;
  public abstract filter: BaseQueue<FilterJob>;
  public abstract enrich: BaseQueue<EnrichJob>;
  public abstract findEmail: BaseQueue<FindEmailJob>;

  public abstract queues(): RegisteredQueue[];

  public abstract close(): Promise<void>;
}

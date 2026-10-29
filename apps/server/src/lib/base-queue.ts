import type { SendEmailProps } from "./base-mailer";
import type { Community } from "./base-skool-scrapper";

export type EmailSender = "auth";

export type EmailJob = SendEmailProps<EmailSender>;

export type MaintenanceJob = { type: "check-queue-backlog" };

/** Prices are whole dollars per month; yearly prices are divided by 12 */
export interface ScrapeFilters {
  minPrice?: number;
  maxPrice?: number;
  minMembers?: number;
  maxMembers?: number;
}

/** Set when a scrape job belongs to a campaign pipeline run */
export interface ScrapeRun {
  runId?: number;
  campaignId?: number;
}

export type ScrapeJob =
  | ({ type: "discover"; search: string } & ScrapeFilters & ScrapeRun)
  | ({ type: "scrape-community"; communityURL: string } & ScrapeRun)
  | ({
      type: "scrape-lead";
      leadURL: string;
      community: Community;
    } & ScrapeRun);

export type EnrichJob = { type: "enrich-lead"; runId: number; leadId: number };

export type FullEnrichJob = {
  type: "fullenrich-lead";
  runId: number;
  leadId: number;
};

/** A job that retrying cannot fix; the queue fails it for good instead of retrying */
export class NonRetryableJobError extends Error {
  public constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "NonRetryableJobError";
  }
}

export interface ConsumeMeta {
  /** True when a failure now will not be retried */
  isFinalAttempt: boolean;
}

export type QueueConsumer<Input> = (
  input: Input,
  meta: ConsumeMeta,
) => Promise<void>;

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
  public abstract enrich: BaseQueue<EnrichJob>;
  public abstract fullenrich: BaseQueue<FullEnrichJob>;

  public abstract queues(): RegisteredQueue[];

  public abstract close(): Promise<void>;
}

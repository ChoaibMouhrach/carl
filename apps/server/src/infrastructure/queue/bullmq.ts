import { Queue, UnrecoverableError, Worker } from "bullmq";
import IORedis from "ioredis";
import type { BaseLogger } from "@server/lib/base-logger";
import type { BaseErrorMonitor } from "@server/lib/base-error-monitor";
import {
  BaseQueue,
  BaseQueueHub,
  type AddJobOptions,
  type EmailJob,
  type EnrichJob,
  type FullEnrichJob,
  type ListFailedInput,
  type ListFailedResult,
  type MaintenanceJob,
  NonRetryableJobError,
  type QueueConsumer,
  type QueueJobCounts,
  type RegisteredQueue,
  type ScrapeJob,
  type ScheduleJobOptions,
} from "@server/lib/base-queue";

const emailQueueName = "email";
const emailJobName = "send";

const maintenanceQueueName = "maintenance";
const maintenanceJobName = "run";
const maintenanceConcurrency = 1;

const scrapeQueueName = "scrape";
const scrapeJobName = "run";

const enrichQueueName = "enrich";
const enrichJobName = "run";

const fullenrichQueueName = "fullenrich";
const fullenrichJobName = "run";
// A retry starts a fresh paid FullEnrich job, so retry rarely and slowly.
const fullenrichAttempts = 3;
const fullenrichBackoffDelayMs = 30_000;

const FAILED_JOB_RETENTION_SECONDS = 60 * 60 * 24 * 7;
const FAILED_JOB_RETENTION_COUNT = 5_000;

interface BullQueueInit {
  attempts?: number;
  backoffDelayMs?: number;
  concurrency: number;
  errorMonitor: BaseErrorMonitor;
  jobName: string;
  logger: BaseLogger;
  name: string;
  redisUrl: string;
}

export class BullQueue<Input> extends BaseQueue<Input> {
  private concurrency: number;
  private errorMonitor: BaseErrorMonitor;
  private jobName: string;
  private logger: BaseLogger;
  private name: string;
  private queueConnection: IORedis;
  private queue: Queue<Input, void, string, Input, void, string>;
  private redisUrl: string;
  private worker?: Worker<Input, void, string>;
  private workerConnection?: IORedis;

  public constructor(init: BullQueueInit) {
    super();

    this.concurrency = init.concurrency;
    this.errorMonitor = init.errorMonitor;
    this.jobName = init.jobName;
    this.logger = init.logger;
    this.name = init.name;
    this.redisUrl = init.redisUrl;
    this.queueConnection = new IORedis(init.redisUrl, {
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue<Input, void, string, Input, void, string>(
      this.name,
      {
        connection: this.queueConnection,
        defaultJobOptions: {
          attempts: init.attempts ?? 5,
          backoff: {
            delay: init.backoffDelayMs ?? 1_000,
            type: "exponential",
          },
          removeOnComplete: 1_000,
          // Failed jobs are the dead-letter store — kept for inspection/retry, then aged out.
          removeOnFail: {
            age: FAILED_JOB_RETENTION_SECONDS,
            count: FAILED_JOB_RETENTION_COUNT,
          },
        },
      },
    );
  }

  public override async add(
    input: Input,
    options?: AddJobOptions,
  ): Promise<void> {
    await this.queue.add(this.jobName, input, {
      jobId: options?.idempotencyKey,
    });
  }

  public override async schedule(
    options: ScheduleJobOptions<Input>,
  ): Promise<void> {
    await this.queue.upsertJobScheduler(
      options.schedulerId,
      { pattern: options.pattern },
      { name: this.jobName, data: options.data },
    );
  }

  public override async consume(consumer: QueueConsumer<Input>): Promise<void> {
    if (this.worker) {
      throw new Error(`The ${this.name} queue already has a consumer.`);
    }

    this.workerConnection = new IORedis(this.redisUrl, {
      maxRetriesPerRequest: null,
    });
    this.worker = new Worker<Input, void, string>(
      this.name,
      async (job) => {
        try {
          await consumer(job.data, {
            isFinalAttempt: job.attemptsMade + 1 >= (job.opts.attempts ?? 1),
          });
        } catch (error) {
          if (error instanceof NonRetryableJobError) {
            throw new UnrecoverableError(error.message);
          }

          throw error;
        }
      },
      {
        connection: this.workerConnection,
        concurrency: this.concurrency,
      },
    );

    this.worker.on("failed", (job, error) => {
      const attempts = job?.opts.attempts ?? 1;
      const exhausted =
        error instanceof UnrecoverableError ||
        (job ? job.attemptsMade >= attempts : false);
      const entry = {
        message: exhausted ? "A job failed for good." : "A job failed.",
        attemptsMade: job?.attemptsMade,
        jobId: job?.id,
        queue: this.name,
      };

      if (exhausted) void this.logger.error(entry, error);
      else void this.logger.warn({ ...entry, reason: error.message });

      if (job && exhausted) {
        this.errorMonitor.captureException(error, {
          tags: {
            signal: "job_failed",
            queue: this.name,
          },
          extra: {
            attemptsMade: job.attemptsMade,
            jobId: job.id,
          },
        });
      }
    });

    this.worker.on("error", (error) => {
      void this.logger.error(
        { message: "A queue worker error.", queue: this.name },
        error,
      );
    });
    await this.worker.waitUntilReady();
  }

  public override async getCounts(): Promise<QueueJobCounts> {
    const counts = await this.queue.getJobCounts(
      "waiting",
      "active",
      "completed",
      "failed",
      "delayed",
      "paused",
    );

    return {
      waiting: counts["waiting"] ?? 0,
      active: counts["active"] ?? 0,
      completed: counts["completed"] ?? 0,
      failed: counts["failed"] ?? 0,
      delayed: counts["delayed"] ?? 0,
      paused: counts["paused"] ?? 0,
    };
  }

  public override async hasJob(
    matches: (input: Input) => boolean,
  ): Promise<boolean> {
    const jobs = await this.queue.getJobs([
      "active",
      "waiting",
      "delayed",
      "prioritized",
      "waiting-children",
    ]);

    return jobs.some((job) => Boolean(job) && matches(job.data));
  }

  public override async listFailed(
    input: ListFailedInput,
  ): Promise<ListFailedResult> {
    const total = await this.queue.getFailedCount();
    const jobs = await this.queue.getJobs(["failed"], input.start, input.end);

    return {
      jobs: jobs
        .filter((job) => Boolean(job))
        .map((job) => ({
          id: job.id ?? "",
          name: job.name,
          data: job.data,
          failedReason: job.failedReason ?? "",
          attemptsMade: job.attemptsMade,
          timestamp: job.timestamp,
          processedOn: job.processedOn ?? null,
          stacktrace: job.stacktrace ?? [],
        })),
      total,
    };
  }

  public override async retry(jobId: string): Promise<boolean> {
    const job = await this.queue.getJob(jobId);

    if (!job) return false;

    await job.retry("failed");

    return true;
  }

  public override async retryAllFailed(): Promise<number> {
    const count = await this.queue.getFailedCount();

    await this.queue.retryJobs({ count, state: "failed" });

    return count;
  }

  public override async remove(jobId: string): Promise<boolean> {
    const job = await this.queue.getJob(jobId);

    if (!job) return false;

    await job.remove();

    return true;
  }

  public override async close(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
    await this.workerConnection?.quit();
    await this.queueConnection.quit();
  }
}

interface EmailQueueInit {
  concurrency: number;
  errorMonitor: BaseErrorMonitor;
  logger: BaseLogger;
  redisUrl: string;
}

export class EmailQueue extends BullQueue<EmailJob> {
  public constructor(init: EmailQueueInit) {
    super({ ...init, jobName: emailJobName, name: emailQueueName });
  }
}

interface MaintenanceQueueInit {
  errorMonitor: BaseErrorMonitor;
  logger: BaseLogger;
  redisUrl: string;
}

export class MaintenanceQueue extends BullQueue<MaintenanceJob> {
  public constructor(init: MaintenanceQueueInit) {
    super({
      ...init,
      concurrency: maintenanceConcurrency,
      jobName: maintenanceJobName,
      name: maintenanceQueueName,
    });
  }
}

interface ScrapeQueueInit {
  concurrency: number;
  /** Only tests set this, to keep their jobs out of the real queue */
  name?: string;
  errorMonitor: BaseErrorMonitor;
  logger: BaseLogger;
  redisUrl: string;
}

export class ScrapeQueue extends BullQueue<ScrapeJob> {
  public constructor(init: ScrapeQueueInit) {
    super({
      ...init,
      jobName: scrapeJobName,
      name: init.name ?? scrapeQueueName,
    });
  }
}

interface EnrichQueueInit {
  concurrency: number;
  errorMonitor: BaseErrorMonitor;
  logger: BaseLogger;
  redisUrl: string;
}

export class EnrichQueue extends BullQueue<EnrichJob> {
  public constructor(init: EnrichQueueInit) {
    super({ ...init, jobName: enrichJobName, name: enrichQueueName });
  }
}

interface FullEnrichQueueInit {
  concurrency: number;
  errorMonitor: BaseErrorMonitor;
  logger: BaseLogger;
  redisUrl: string;
}

export class FullEnrichQueue extends BullQueue<FullEnrichJob> {
  public constructor(init: FullEnrichQueueInit) {
    super({
      ...init,
      attempts: fullenrichAttempts,
      backoffDelayMs: fullenrichBackoffDelayMs,
      jobName: fullenrichJobName,
      name: fullenrichQueueName,
    });
  }
}

interface QueueHubInit extends EmailQueueInit {
  scrapeConcurrency: number;
  enrichConcurrency: number;
  fullenrichConcurrency: number;
}

export class QueueHub extends BaseQueueHub {
  public email: EmailQueue;
  public maintenance: MaintenanceQueue;
  public scrape: ScrapeQueue;
  public enrich: EnrichQueue;
  public fullenrich: FullEnrichQueue;

  public constructor(init: QueueHubInit) {
    super();
    this.email = new EmailQueue(init);
    this.scrape = new ScrapeQueue({
      concurrency: init.scrapeConcurrency,
      errorMonitor: init.errorMonitor,
      logger: init.logger,
      redisUrl: init.redisUrl,
    });
    this.enrich = new EnrichQueue({
      concurrency: init.enrichConcurrency,
      errorMonitor: init.errorMonitor,
      logger: init.logger,
      redisUrl: init.redisUrl,
    });
    this.fullenrich = new FullEnrichQueue({
      concurrency: init.fullenrichConcurrency,
      errorMonitor: init.errorMonitor,
      logger: init.logger,
      redisUrl: init.redisUrl,
    });
    this.maintenance = new MaintenanceQueue({
      errorMonitor: init.errorMonitor,
      logger: init.logger,
      redisUrl: init.redisUrl,
    });
  }

  public override queues(): RegisteredQueue[] {
    return [
      { name: emailQueueName, queue: this.email },
      { name: maintenanceQueueName, queue: this.maintenance },
      { name: scrapeQueueName, queue: this.scrape },
      { name: enrichQueueName, queue: this.enrich },
      { name: fullenrichQueueName, queue: this.fullenrich },
    ];
  }

  public override async close(): Promise<void> {
    await this.email.close();
    await this.maintenance.close();
    await this.scrape.close();
    await this.enrich.close();
    await this.fullenrich.close();
  }
}

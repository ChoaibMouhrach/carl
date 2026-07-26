import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import type { BaseLogger } from "@server/lib/base-logger";
import {
  BaseQueue,
  BaseQueueHub,
  type AddJobOptions,
  type EmailJob,
  type ListFailedInput,
  type ListFailedResult,
  type QueueConsumer,
  type QueueJobCounts,
  type RegisteredQueue,
} from "@server/lib/base-queue";

const emailQueueName = "email";
const emailJobName = "send";

interface BullQueueInit {
  concurrency: number;
  jobName: string;
  logger: BaseLogger;
  name: string;
  redisUrl: string;
}

class BullQueue<Input> extends BaseQueue<Input> {
  private concurrency: number;
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
          attempts: 5,
          backoff: {
            delay: 1_000,
            type: "exponential",
          },
          removeOnComplete: 1_000,
          removeOnFail: false,
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
        await consumer(job.data);
      },
      {
        connection: this.workerConnection,
        concurrency: this.concurrency,
      },
    );

    this.worker.on("failed", (job, error) => {
      void this.logger.info({
        attemptsMade: job?.attemptsMade,
        error: error.message,
        jobId: job?.id,
        queue: this.name,
      });
    });

    this.worker.on("error", (error) => {
      void this.logger.info({
        error: error.message,
        queue: this.name,
      });
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
  logger: BaseLogger;
  redisUrl: string;
}

export class EmailQueue extends BullQueue<EmailJob> {
  public constructor(init: EmailQueueInit) {
    super({ ...init, jobName: emailJobName, name: emailQueueName });
  }
}

export class QueueHub extends BaseQueueHub {
  public email: EmailQueue;

  public constructor(init: EmailQueueInit) {
    super();
    this.email = new EmailQueue(init);
  }

  public override queues(): RegisteredQueue[] {
    return [{ name: emailQueueName, queue: this.email }];
  }

  public override async close(): Promise<void> {
    await this.email.close();
  }
}

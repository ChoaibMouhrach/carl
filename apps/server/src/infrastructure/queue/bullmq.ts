import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import type { BaseLogger } from "@server/lib/base-logger";
import {
  BaseQueue,
  BaseQueueHub,
  type EmailJob,
  type QueueConsumer,
} from "@server/lib/base-queue";

const emailQueueName = "email";
const emailJobName = "send";

interface EmailQueueInit {
  concurrency: number;
  logger: BaseLogger;
  redisUrl: string;
}

export class EmailQueue extends BaseQueue<EmailJob> {
  private concurrency: number;
  private logger: BaseLogger;
  private queueConnection: IORedis;
  private queue: Queue<Job<EmailJob, void, typeof emailJobName>>;
  private redisUrl: string;
  private worker?: Worker<EmailJob, void, typeof emailJobName>;
  private workerConnection?: IORedis;

  public constructor(init: EmailQueueInit) {
    super();

    this.concurrency = init.concurrency;
    this.logger = init.logger;
    this.redisUrl = init.redisUrl;
    this.queueConnection = new IORedis(init.redisUrl, {
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue<Job<EmailJob, void, typeof emailJobName>>(
      emailQueueName,
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

  public override async add(input: EmailJob): Promise<void> {
    await this.queue.add(emailJobName, input);
  }

  public override async consume(
    consumer: QueueConsumer<EmailJob>,
  ): Promise<void> {
    if (this.worker) {
      throw new Error("The email queue already has a consumer.");
    }

    this.workerConnection = new IORedis(this.redisUrl, {
      maxRetriesPerRequest: null,
    });
    this.worker = new Worker<EmailJob, void, typeof emailJobName>(
      emailQueueName,
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
        queue: emailQueueName,
      });
    });

    this.worker.on("error", (error) => {
      void this.logger.info({
        error: error.message,
        queue: emailQueueName,
      });
    });
    await this.worker.waitUntilReady();
  }

  public override async close(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
    await this.workerConnection?.quit();
    await this.queueConnection.quit();
  }
}

export class QueueHub extends BaseQueueHub {
  public email: EmailQueue;

  public constructor(init: EmailQueueInit) {
    super();
    this.email = new EmailQueue(init);
  }

  public override async close(): Promise<void> {
    await this.email.close();
  }
}

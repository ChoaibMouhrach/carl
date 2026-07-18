import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import type { BaseLogger } from "@server/lib/base-logger";
import { BaseQueue, BaseQueueHub, type EmailJob } from "@server/lib/base-queue";
import type { BaseMailer } from "@server/lib/base-mailer";

const emailQueueName = "email";
const emailJobName = "send";

interface EmailQueueInit {
  concurrency: number;
  logger: BaseLogger;
  mailer: BaseMailer;
  redisUrl: string;
}

export class EmailQueue extends BaseQueue<EmailJob> {
  private connection: IORedis;
  private queue: Queue<Job<EmailJob, void, typeof emailJobName>>;
  private worker: Worker<EmailJob, void, typeof emailJobName>;

  public constructor(init: EmailQueueInit) {
    super();

    this.connection = new IORedis(init.redisUrl, {
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue<Job<EmailJob, void, typeof emailJobName>>(
      emailQueueName,
      {
        connection: this.connection,
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
    this.worker = new Worker<EmailJob, void, typeof emailJobName>(
      emailQueueName,
      async (job) => {
        await init.mailer.email(job.data);
      },
      {
        connection: this.connection,
        concurrency: init.concurrency,
      },
    );

    this.worker.on("failed", (job, error) => {
      void init.logger.info({
        attemptsMade: job?.attemptsMade,
        error: error.message,
        jobId: job?.id,
        queue: emailQueueName,
      });
    });

    this.worker.on("error", (error) => {
      void init.logger.info({
        error: error.message,
        queue: emailQueueName,
      });
    });
  }

  public override async add(input: EmailJob): Promise<void> {
    await this.queue.add(emailJobName, input);
  }

  public override async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
    await this.connection.quit();
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

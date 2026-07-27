import type { ENV } from "@server/config/env";
import type { Context } from "@server/context";
import type { DB } from "@server/infrastructure/database/client";
import {
  BaseBilling,
  type BillingSubscriptionSnapshot,
} from "@server/lib/base-billing";
import { BaseLogger } from "@server/lib/base-logger";
import { BaseMailer, type SendEmailProps } from "@server/lib/base-mailer";
import {
  BaseQueue,
  BaseQueueHub,
  type AddJobOptions,
  type EmailJob,
  type FailedJob,
  type ListFailedInput,
  type ListFailedResult,
  type MaintenanceJob,
  type QueueConsumer,
  type QueueJobCounts,
  type RegisteredQueue,
  type ScheduleJobOptions,
} from "@server/lib/base-queue";
import { BaseRateLimiter } from "@server/lib/base-rate-limiter";
import { BaseStorage } from "@server/lib/base-storage";
import { Repositories } from "@server/repositories";
import { DisabledErrorMonitor } from "@server/infrastructure/error-monitor/disabled";
import { getStripePriceId } from "@repo/constants/billing";
import type { AppContext, AuthAppContext } from "@server/app";
import type { MiddlewareHandler } from "hono";
import type { Pool } from "pg";
import { createAuth } from "@server/infrastructure/auth";

class TestLogger extends BaseLogger {
  public override async info(_message: string | object): Promise<void> {}
}

export class TestMailer extends BaseMailer {
  public emails: SendEmailProps<string>[] = [];
  public emailsSent = 0;
  public sentAt: number[] = [];
  public shouldFail = false;
  public verifyShouldFail = false;

  public override async email<From extends string>(
    props: SendEmailProps<From>,
  ): Promise<void> {
    this.emails.push(props);
    this.emailsSent += 1;
    this.sentAt.push(Date.now());

    if (this.shouldFail) {
      throw new Error("Test mailer failed.");
    }
  }

  public override async verify(): Promise<void> {
    if (this.verifyShouldFail) {
      throw new Error("Test mailer verification failed.");
    }
  }
}

class TestStorage extends BaseStorage {
  public override async getSignedUrl(_input: {
    contentType: string;
    key: string;
  }): Promise<{ signedUrl: string; url: string }> {
    return {
      signedUrl: "https://storage.test/upload",
      url: "https://storage.test/file",
    };
  }

  public override async removeFile(_input: { key: string }): Promise<void> {}
}

interface TestJob<Input> {
  id: string;
  data: Input;
  attemptsMade: number;
  failedReason: string | null;
  status: "completed" | "failed";
}

export class TestQueue<Input> extends BaseQueue<Input> {
  public waiting = 0;
  private consumer?: QueueConsumer<Input>;
  private process: (input: Input) => Promise<void>;
  private jobs = new Map<string, TestJob<Input>>();
  private counter = 0;

  public constructor(init: { process: (input: Input) => Promise<void> }) {
    super();
    this.process = init.process;
  }

  public override async add(
    input: Input,
    options?: AddJobOptions,
  ): Promise<void> {
    const id = options?.idempotencyKey ?? `job-${(this.counter += 1)}`;

    if (this.jobs.has(id)) return;

    const job: TestJob<Input> = {
      id,
      data: input,
      attemptsMade: 0,
      failedReason: null,
      status: "completed",
    };
    this.jobs.set(id, job);
    await this.runJob(job);
  }

  public override async schedule(
    _options: ScheduleJobOptions<Input>,
  ): Promise<void> {}

  public override async consume(consumer: QueueConsumer<Input>): Promise<void> {
    this.consumer = consumer;
  }

  public override async getCounts(): Promise<QueueJobCounts> {
    const failed = this.failedJobs().length;

    return {
      waiting: this.waiting,
      active: 0,
      completed: this.jobs.size - failed,
      failed,
      delayed: 0,
      paused: 0,
    };
  }

  public override async listFailed(
    input: ListFailedInput,
  ): Promise<ListFailedResult> {
    const failed = this.failedJobs();

    return {
      jobs: failed.slice(input.start, input.end + 1).map(toTestFailedJob),
      total: failed.length,
    };
  }

  public override async retry(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);

    if (!job) return false;

    await this.runJob(job);

    return true;
  }

  public override async retryAllFailed(): Promise<number> {
    const failed = this.failedJobs();

    for (const job of failed) {
      await this.runJob(job);
    }

    return failed.length;
  }

  public override async remove(jobId: string): Promise<boolean> {
    return this.jobs.delete(jobId);
  }

  public override async close(): Promise<void> {}

  private failedJobs(): TestJob<Input>[] {
    return [...this.jobs.values()].filter((job) => job.status === "failed");
  }

  private async runJob(job: TestJob<Input>): Promise<void> {
    const handler = this.consumer ?? this.process;
    job.attemptsMade += 1;

    try {
      await handler(job.data);
      job.status = "completed";
      job.failedReason = null;
    } catch (error) {
      job.status = "failed";
      job.failedReason = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }
}

const toTestFailedJob = <Input>(job: TestJob<Input>): FailedJob => ({
  id: job.id,
  name: "send",
  data: job.data,
  failedReason: job.failedReason ?? "",
  attemptsMade: job.attemptsMade,
  timestamp: 0,
  processedOn: null,
  stacktrace: [],
});

export class TestQueueHub extends BaseQueueHub {
  public email: TestQueue<EmailJob>;
  public maintenance: TestQueue<MaintenanceJob>;

  public constructor(init: { mailer: BaseMailer }) {
    super();
    this.email = new TestQueue<EmailJob>({
      process: async (input) => {
        await init.mailer.email(input);
      },
    });
    this.maintenance = new TestQueue<MaintenanceJob>({
      process: async () => {},
    });
  }

  public override queues(): RegisteredQueue[] {
    return [{ name: "email", queue: this.email }];
  }

  public override async close(): Promise<void> {}
}

class TestRateLimiter extends BaseRateLimiter {
  public anonymous: MiddlewareHandler<AppContext> = async (_context, next) => {
    await next();
  };
  public authEmail: MiddlewareHandler<AppContext> = async (_context, next) => {
    await next();
  };
  public authIp: MiddlewareHandler<AppContext> = async (_context, next) => {
    await next();
  };
  public authenticated: MiddlewareHandler<AuthAppContext> = async (
    _context,
    next,
  ) => {
    await next();
  };
  public billing: MiddlewareHandler<AuthAppContext> = async (
    _context,
    next,
  ) => {
    await next();
  };
  public platformSetup: MiddlewareHandler<AppContext> = async (
    _context,
    next,
  ) => {
    await next();
  };
  public storage: MiddlewareHandler<AuthAppContext> = async (
    _context,
    next,
  ) => {
    await next();
  };

  public override async ping(): Promise<void> {}

  public override async close(): Promise<void> {}
}

export class TestBilling extends BaseBilling {
  public override readonly provider = "stripe";
  public checkoutSessionRequests = 0;
  public listSubscriptionIdsCalls = 0;
  public cancelledSubscriptionIds: string[] = [];
  public changedSubscriptions: Array<{
    billingInterval: "monthly" | "yearly";
    planKey: "starter" | "pro" | "business";
    providerSubscriptionId: string;
    timing: "immediate" | "period_end";
  }> = [];
  public immediatelyCancelledSubscriptionIds: string[] = [];
  public updatedCustomers: Array<{
    email: string;
    providerCustomerId: string;
  }> = [];
  public providerCheckoutSessionId: string | null = null;
  public invoiceBillingReason: string | null = null;
  public providerEventId = "evt_test";
  public providerSubscriptionId: string | null = null;
  public providerSubscriptionIds: string[] = [];
  public retrievedCheckoutSessionIds: string[] = [];
  public snapshot: BillingSubscriptionSnapshot | null = null;
  public snapshotsBySubscriptionId = new Map<
    string,
    BillingSubscriptionSnapshot
  >();
  public webhookType = "test.event";

  public override async createCustomer(): Promise<{
    providerCustomerId: string;
  }> {
    return { providerCustomerId: "cus_test" };
  }

  public override async createCheckoutSession(): Promise<{
    expiresAt: Date;
    providerCheckoutSessionId: string;
    url: string;
  }> {
    this.checkoutSessionRequests += 1;

    return {
      expiresAt: new Date(Date.now() + 5 * 60 * 1_000),
      providerCheckoutSessionId: "cs_test",
      url: "https://billing.test/checkout",
    };
  }

  public override async getCheckoutSession(input: {
    providerCheckoutSessionId: string;
  }): Promise<{ url: string | null }> {
    this.retrievedCheckoutSessionIds.push(input.providerCheckoutSessionId);

    return { url: "https://billing.test/checkout" };
  }

  public override async createPortalSession(): Promise<{ url: string }> {
    return { url: "https://billing.test/portal" };
  }

  public override async cancelSubscription(input: {
    providerSubscriptionId: string;
  }): Promise<void> {
    this.cancelledSubscriptionIds.push(input.providerSubscriptionId);
    if (this.snapshot) {
      this.snapshot = { ...this.snapshot, cancelAtPeriodEnd: true };
    }
  }

  public override async cancelSubscriptionImmediately(input: {
    providerSubscriptionId: string;
  }): Promise<void> {
    this.immediatelyCancelledSubscriptionIds.push(input.providerSubscriptionId);
  }

  public override async updateCustomerEmail(input: {
    email: string;
    providerCustomerId: string;
  }): Promise<void> {
    this.updatedCustomers.push(input);
  }

  public override async resumeSubscription(input: {
    providerSubscriptionId: string;
  }): Promise<void> {
    if (
      this.snapshot?.providerSubscriptionId === input.providerSubscriptionId
    ) {
      this.snapshot = { ...this.snapshot, cancelAtPeriodEnd: false };
    }
  }

  public override async changeSubscription(input: {
    billingInterval: "monthly" | "yearly";
    planKey: "starter" | "pro" | "business";
    providerSubscriptionId: string;
    timing: "immediate" | "period_end";
  }): Promise<void> {
    this.changedSubscriptions.push(input);

    if (
      input.timing === "immediate" &&
      this.snapshot?.providerSubscriptionId === input.providerSubscriptionId
    ) {
      this.snapshot = {
        ...this.snapshot,
        billingInterval: input.billingInterval,
        planKey: input.planKey,
        providerPriceId: getStripePriceId(input.planKey, input.billingInterval),
        scheduledBillingInterval: null,
        scheduledPlanKey: null,
      };

      return;
    }

    if (
      input.timing === "period_end" &&
      this.snapshot?.providerSubscriptionId === input.providerSubscriptionId
    ) {
      this.snapshot = {
        ...this.snapshot,
        scheduledBillingInterval: input.billingInterval,
        scheduledPlanKey: input.planKey,
      };
    }
  }

  public override async getSubscriptionSnapshot(input: {
    providerSubscriptionId: string;
  }): Promise<BillingSubscriptionSnapshot> {
    const snapshot = this.snapshotsBySubscriptionId.get(
      input.providerSubscriptionId,
    );

    if (snapshot) return snapshot;

    if (!this.snapshot) {
      throw new Error("Test billing does not provide Stripe subscriptions.");
    }

    return this.snapshot;
  }

  public override async listSubscriptionIds(): Promise<string[]> {
    this.listSubscriptionIdsCalls += 1;

    if (this.providerSubscriptionIds.length > 0) {
      return this.providerSubscriptionIds;
    }

    return this.providerSubscriptionId ? [this.providerSubscriptionId] : [];
  }

  public override async verifyWebhook(): Promise<{
    invoiceBillingReason: string | null;
    payload: unknown;
    providerCheckoutSessionId: string | null;
    providerEventId: string;
    providerSubscriptionId: string | null;
    type: string;
  }> {
    return {
      invoiceBillingReason: this.invoiceBillingReason,
      payload: {},
      providerCheckoutSessionId: this.providerCheckoutSessionId,
      providerEventId: this.providerEventId,
      providerSubscriptionId: this.providerSubscriptionId,
      type: this.webhookType,
    };
  }
}

export const createContext = (
  db: DB,
  pool: Pool,
  env: ENV,
  billing: BaseBilling = new TestBilling(),
  mailer: BaseMailer = new TestMailer(),
  rateLimiter: BaseRateLimiter = new TestRateLimiter(),
): Context => {
  const queueHub = new TestQueueHub({ mailer });

  return {
    auth: createAuth({ db, env, queueHub }),
    billing,
    env,
    errorMonitor: new DisabledErrorMonitor(),
    logger: new TestLogger(),
    mailer,
    queueHub,
    rateLimiter,
    repositories: new Repositories({ dbConnection: { db, pool } }),
    storage: new TestStorage(),
  };
};

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
  type EmailJob,
  type QueueConsumer,
} from "@server/lib/base-queue";
import { BaseRateLimiter } from "@server/lib/base-rate-limiter";
import { BaseStorage } from "@server/lib/base-storage";
import { Repositories } from "@server/repositories";
import { getStripePriceId } from "@repo/constants/billing";
import type { AppContext, AuthAppContext } from "@server/app";
import type { MiddlewareHandler } from "hono";
import type { Pool } from "pg";
import { createAuth } from "@server/infrastructure/auth";

class TestLogger extends BaseLogger {
  public override async info(_message: string | object): Promise<void> {}
}

export class TestMailer extends BaseMailer {
  public emailsSent = 0;
  public sentAt: number[] = [];
  public shouldFail = false;

  public override async email<From extends string>(
    _props: SendEmailProps<From>,
  ): Promise<void> {
    this.emailsSent += 1;
    this.sentAt.push(Date.now());

    if (this.shouldFail) {
      throw new Error("Test mailer failed.");
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

class TestQueue<Input> extends BaseQueue<Input> {
  private consumer?: QueueConsumer<Input>;
  private process: (input: Input) => Promise<void>;

  public constructor(init: { process: (input: Input) => Promise<void> }) {
    super();
    this.process = init.process;
  }

  public override async add(input: Input): Promise<void> {
    if (this.consumer) {
      await this.consumer(input);
      return;
    }

    await this.process(input);
  }

  public override async consume(consumer: QueueConsumer<Input>): Promise<void> {
    this.consumer = consumer;
  }

  public override async close(): Promise<void> {}
}

export class TestQueueHub extends BaseQueueHub {
  public email: TestQueue<EmailJob>;

  public constructor(init: { mailer: BaseMailer }) {
    super();
    this.email = new TestQueue<EmailJob>({
      process: async (input) => {
        await init.mailer.email(input);
      },
    });
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

  public override async close(): Promise<void> {}
}

export class TestBilling extends BaseBilling {
  public override readonly provider = "stripe";
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
    return {
      expiresAt: new Date(),
      providerCheckoutSessionId: "cs_test",
      url: "https://billing.test/checkout",
    };
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
    logger: new TestLogger(),
    mailer,
    queueHub,
    rateLimiter,
    repositories: new Repositories({ dbConnection: { db, pool } }),
    storage: new TestStorage(),
  };
};

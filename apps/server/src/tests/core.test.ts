import { expect, test } from "bun:test";
import crypto from "crypto";
import { eq, sql } from "drizzle-orm";
import { initApp } from "@server/app";
import { initENV } from "@server/config/env";
import { initDB } from "@server/infrastructure/database/client";
import {
  billingCustomersTable,
  billingEventsTable,
  checkoutAttemptsTable,
  notificationsTable,
  settingsTable,
  subscriptionsTable,
  usersTable,
} from "@server/infrastructure/database/schemas";
import { BillingService } from "@server/services/billing";
import { BillingAccessService } from "@server/services/billing-access";
import { AuthService } from "@server/services/auth";
import { UserService } from "@server/services/user";
import { BILLING_PAST_DUE_GRACE_PERIOD_MS } from "@server/config/constants";
import { TEST_DB_TEMPLATE } from "./setup";
import { createContext, TestBilling, TestMailer } from "./helpers/billing";

test("setup creates the first admin and leaves a clean database without demo data", async () => {
  const env = initENV();
  const root = await initDB({
    connectionCredentials: env.POSTGRES_CONNECTION_STRING,
  });
  const databaseName = `test_${crypto.randomUUID().replaceAll("-", "_")}`;
  await root.db.execute(
    sql.raw(`CREATE DATABASE ${databaseName} TEMPLATE ${TEST_DB_TEMPLATE}`),
  );

  const connection = await initDB({
    connectionCredentials: {
      host: env.POSTGRES_HOST,
      name: databaseName,
      pass: env.POSTGRES_PASS,
      port: env.POSTGRES_PORT,
      user: env.POSTGRES_USER,
    },
  });

  try {
    const app = await initApp({
      context: createContext(connection.db, connection.pool, env),
    });
    const beforeSetup = await app.request("/api/platform-setup");
    expect(beforeSetup.status).toBe(200);
    expect(await beforeSetup.json()).toEqual({ setupDone: false });

    const setup = await app.request("/api/platform-setup", {
      body: JSON.stringify({
        email: "owner@example.com",
        password: "secure-password",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(setup.status).toBe(204);

    const users = await connection.db.select().from(usersTable);
    const settings = await connection.db.select().from(settingsTable);
    expect(users).toHaveLength(1);
    expect(users[0]?.email).toBe("owner@example.com");
    expect(users[0]?.role).toBe("admin");
    expect(settings).toHaveLength(1);
    expect(settings[0]?.key).toBe("setup");
  } finally {
    await connection.pool.end();
    await root.db.execute(sql.raw(`DROP DATABASE ${databaseName}`));
    await root.pool.end();
  }
});

test("checkout creates no subscription until Stripe confirms completion", async () => {
  const env = initENV();
  const root = await initDB({
    connectionCredentials: env.POSTGRES_CONNECTION_STRING,
  });
  const databaseName = `test_${crypto.randomUUID().replaceAll("-", "_")}`;
  await root.db.execute(
    sql.raw(`CREATE DATABASE ${databaseName} TEMPLATE ${TEST_DB_TEMPLATE}`),
  );

  const connection = await initDB({
    connectionCredentials: {
      host: env.POSTGRES_HOST,
      name: databaseName,
      pass: env.POSTGRES_PASS,
      port: env.POSTGRES_PORT,
      user: env.POSTGRES_USER,
    },
  });

  try {
    const context = createContext(connection.db, connection.pool, env);
    const user = await context.repositories.user.create({
      email: "subscriber@example.com",
      emailVerifiedAt: new Date(),
      role: "user",
    });
    const billing = new BillingService({ context });

    const checkout = await billing.createCheckoutSession({
      billingInterval: "monthly",
      email: user.email,
      planKey: "starter",
      userId: user.userId,
    });

    expect(checkout).toEqual({ url: "https://billing.test/checkout" });

    const customers = await connection.db.select().from(billingCustomersTable);
    const attempts = await connection.db.select().from(checkoutAttemptsTable);
    const subscriptions = await connection.db.select().from(subscriptionsTable);

    expect(customers).toEqual([
      expect.objectContaining({
        provider: "stripe",
        providerCustomerId: "cus_test",
        userId: user.userId,
      }),
    ]);
    expect(attempts).toEqual([
      expect.objectContaining({
        billingInterval: "monthly",
        planKey: "starter",
        providerCheckoutSessionId: "cs_test",
        userId: user.userId,
      }),
    ]);
    expect(subscriptions).toEqual([]);
  } finally {
    await connection.pool.end();
    await root.db.execute(sql.raw(`DROP DATABASE ${databaseName}`));
    await root.pool.end();
  }
});

test("checkout completion creates one subscription and processes duplicate webhooks once", async () => {
  const env = initENV();
  const root = await initDB({
    connectionCredentials: env.POSTGRES_CONNECTION_STRING,
  });
  const databaseName = `test_${crypto.randomUUID().replaceAll("-", "_")}`;
  await root.db.execute(
    sql.raw(`CREATE DATABASE ${databaseName} TEMPLATE ${TEST_DB_TEMPLATE}`),
  );

  const connection = await initDB({
    connectionCredentials: {
      host: env.POSTGRES_HOST,
      name: databaseName,
      pass: env.POSTGRES_PASS,
      port: env.POSTGRES_PORT,
      user: env.POSTGRES_USER,
    },
  });

  try {
    const testBilling = new TestBilling();
    testBilling.providerCheckoutSessionId = "cs_completed";
    testBilling.providerEventId = "evt_checkout_completed";
    testBilling.providerSubscriptionId = "sub_completed";
    testBilling.snapshot = {
      billingInterval: "monthly",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
      currentPeriodStart: new Date("2026-07-01T00:00:00.000Z"),
      endedAt: null,
      localUserId: null,
      scheduledBillingInterval: null,
      scheduledPlanKey: null,
      planKey: "starter",
      provider: "stripe",
      providerCustomerId: "cus_completed",
      providerPriceId: "price_1TuHqHInV3KLo0c7LutflX92",
      providerSubscriptionId: "sub_completed",
      status: "active",
    };
    testBilling.webhookType = "checkout.session.completed";

    const context = createContext(
      connection.db,
      connection.pool,
      env,
      testBilling,
    );
    const user = await context.repositories.user.create({
      email: "completed@example.com",
      emailVerifiedAt: new Date(),
      role: "user",
    });
    const customer = await context.repositories.billing.createCustomer({
      provider: "stripe",
      providerCustomerId: "cus_completed",
      userId: user.userId,
    });
    await context.repositories.billing.createCheckoutAttempt({
      billingInterval: "monthly",
      expiresAt: new Date("2026-08-01T00:00:00.000Z"),
      planKey: "starter",
      provider: "stripe",
      userId: user.userId,
    });
    const attempt =
      await context.repositories.billing.findActiveCheckoutAttempt({
        userId: user.userId,
      });
    expect(attempt).not.toBeNull();
    if (!attempt) {
      throw new Error("Expected checkout attempt to exist.");
    }
    await context.repositories.billing.setCheckoutSession({
      checkoutAttemptId: attempt.checkoutAttemptId,
      expiresAt: new Date("2026-08-01T00:00:00.000Z"),
      providerCheckoutSessionId: "cs_completed",
    });

    const billing = new BillingService({ context });
    await billing.processWebhook({ payload: "{}", signature: "test" });
    await billing.processWebhook({ payload: "{}", signature: "test" });

    const subscriptions = await connection.db.select().from(subscriptionsTable);
    const events = await connection.db.select().from(billingEventsTable);
    const attempts = await connection.db.select().from(checkoutAttemptsTable);

    expect(customer.providerCustomerId).toBe("cus_completed");
    expect(subscriptions).toEqual([
      expect.objectContaining({
        billingCustomerId: customer.billingCustomerId,
        billingInterval: "monthly",
        planKey: "starter",
        providerSubscriptionId: "sub_completed",
        status: "active",
      }),
    ]);
    expect(events).toEqual([
      expect.objectContaining({
        providerEventId: "evt_checkout_completed",
        processedAt: expect.any(Date),
      }),
    ]);
    expect(attempts).toEqual([
      expect.objectContaining({
        completedAt: expect.any(Date),
        providerCheckoutSessionId: "cs_completed",
      }),
    ]);
  } finally {
    await connection.pool.end();
    await root.db.execute(sql.raw(`DROP DATABASE ${databaseName}`));
    await root.pool.end();
  }
});

test("past-due subscriptions retain access only for the configured grace period", async () => {
  const env = initENV();
  const root = await initDB({
    connectionCredentials: env.POSTGRES_CONNECTION_STRING,
  });
  const databaseName = `test_${crypto.randomUUID().replaceAll("-", "_")}`;
  await root.db.execute(
    sql.raw(`CREATE DATABASE ${databaseName} TEMPLATE ${TEST_DB_TEMPLATE}`),
  );

  const connection = await initDB({
    connectionCredentials: {
      host: env.POSTGRES_HOST,
      name: databaseName,
      pass: env.POSTGRES_PASS,
      port: env.POSTGRES_PORT,
      user: env.POSTGRES_USER,
    },
  });

  try {
    const testBilling = new TestBilling();
    testBilling.providerEventId = "evt_past_due";
    testBilling.providerSubscriptionId = "sub_past_due";
    testBilling.snapshot = {
      billingInterval: "monthly",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
      currentPeriodStart: new Date("2026-07-01T00:00:00.000Z"),
      endedAt: null,
      localUserId: null,
      scheduledBillingInterval: null,
      scheduledPlanKey: null,
      planKey: "pro",
      provider: "stripe",
      providerCustomerId: "cus_past_due",
      providerPriceId: "price_1TuHqgInV3KLo0c7vLa9cxWC",
      providerSubscriptionId: "sub_past_due",
      status: "past_due",
    };
    const context = createContext(
      connection.db,
      connection.pool,
      env,
      testBilling,
    );
    const user = await context.repositories.user.create({
      email: "past-due@example.com",
      emailVerifiedAt: new Date(),
      role: "user",
    });
    await context.repositories.billing.createCustomer({
      provider: "stripe",
      providerCustomerId: "cus_past_due",
      userId: user.userId,
    });

    const billing = new BillingService({ context });
    const access = new BillingAccessService({ context });
    await billing.processWebhook({ payload: "{}", signature: "test" });

    expect(await access.check({ userId: user.userId })).toEqual({
      access: true,
      graceEndsAt: expect.any(Date),
      reason: "past_due",
    });

    const expiredAt = new Date(
      Date.now() - BILLING_PAST_DUE_GRACE_PERIOD_MS - 1_000,
    );
    await connection.db
      .update(subscriptionsTable)
      .set({ pastDueAt: expiredAt })
      .where(eq(subscriptionsTable.providerSubscriptionId, "sub_past_due"));

    expect(await access.check({ userId: user.userId })).toEqual({
      access: false,
      graceEndsAt: new Date(
        expiredAt.getTime() + BILLING_PAST_DUE_GRACE_PERIOD_MS,
      ),
      reason: "past_due",
    });
  } finally {
    await connection.pool.end();
    await root.db.execute(sql.raw(`DROP DATABASE ${databaseName}`));
    await root.pool.end();
  }
});

test("cancellation and resubscription synchronize the persisted subscription", async () => {
  const env = initENV();
  const root = await initDB({
    connectionCredentials: env.POSTGRES_CONNECTION_STRING,
  });
  const databaseName = `test_${crypto.randomUUID().replaceAll("-", "_")}`;
  await root.db.execute(
    sql.raw(`CREATE DATABASE ${databaseName} TEMPLATE ${TEST_DB_TEMPLATE}`),
  );

  const connection = await initDB({
    connectionCredentials: {
      host: env.POSTGRES_HOST,
      name: databaseName,
      pass: env.POSTGRES_PASS,
      port: env.POSTGRES_PORT,
      user: env.POSTGRES_USER,
    },
  });

  try {
    const testBilling = new TestBilling();
    testBilling.providerEventId = "evt_subscription_active";
    testBilling.providerSubscriptionId = "sub_cancel_resume";
    testBilling.snapshot = {
      billingInterval: "yearly",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date("2026-12-01T00:00:00.000Z"),
      currentPeriodStart: new Date("2026-01-01T00:00:00.000Z"),
      endedAt: null,
      localUserId: null,
      scheduledBillingInterval: null,
      scheduledPlanKey: null,
      planKey: "business",
      provider: "stripe",
      providerCustomerId: "cus_cancel_resume",
      providerPriceId: "price_1TuIM4InV3KLo0c7mhbIdwhE",
      providerSubscriptionId: "sub_cancel_resume",
      status: "active",
    };
    const context = createContext(
      connection.db,
      connection.pool,
      env,
      testBilling,
    );
    const user = await context.repositories.user.create({
      email: "cancel-resume@example.com",
      emailVerifiedAt: new Date(),
      role: "user",
    });
    await context.repositories.billing.createCustomer({
      provider: "stripe",
      providerCustomerId: "cus_cancel_resume",
      userId: user.userId,
    });
    const billing = new BillingService({ context });
    await billing.processWebhook({ payload: "{}", signature: "test" });

    await billing.cancelSubscription({ userId: user.userId });
    const canceling = await connection.db.select().from(subscriptionsTable);
    const notifications = await connection.db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, user.userId));

    expect(testBilling.cancelledSubscriptionIds).toEqual(["sub_cancel_resume"]);
    expect(canceling).toEqual([
      expect.objectContaining({
        cancelAtPeriodEnd: true,
        providerSubscriptionId: "sub_cancel_resume",
      }),
    ]);
    expect(notifications).toEqual([
      expect.objectContaining({
        title: "Your subscription has been canceled",
        type: "billing.subscription_canceled",
      }),
    ]);

    await billing.resumeSubscription({ userId: user.userId });
    const resumed = await connection.db.select().from(subscriptionsTable);

    expect(resumed).toEqual([
      expect.objectContaining({
        cancelAtPeriodEnd: false,
        providerSubscriptionId: "sub_cancel_resume",
      }),
    ]);
  } finally {
    await connection.pool.end();
    await root.db.execute(sql.raw(`DROP DATABASE ${databaseName}`));
    await root.pool.end();
  }
});

test("upgrades apply immediately while downgrades and interval changes wait for renewal", async () => {
  const env = initENV();
  const root = await initDB({
    connectionCredentials: env.POSTGRES_CONNECTION_STRING,
  });
  const databaseName = `test_${crypto.randomUUID().replaceAll("-", "_")}`;
  await root.db.execute(
    sql.raw(`CREATE DATABASE ${databaseName} TEMPLATE ${TEST_DB_TEMPLATE}`),
  );

  const connection = await initDB({
    connectionCredentials: {
      host: env.POSTGRES_HOST,
      name: databaseName,
      pass: env.POSTGRES_PASS,
      port: env.POSTGRES_PORT,
      user: env.POSTGRES_USER,
    },
  });

  try {
    const testBilling = new TestBilling();
    testBilling.providerEventId = "evt_plan_change";
    testBilling.providerSubscriptionId = "sub_plan_change";
    testBilling.snapshot = {
      billingInterval: "monthly",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
      currentPeriodStart: new Date("2026-07-01T00:00:00.000Z"),
      endedAt: null,
      localUserId: null,
      scheduledBillingInterval: null,
      scheduledPlanKey: null,
      planKey: "starter",
      provider: "stripe",
      providerCustomerId: "cus_plan_change",
      providerPriceId: "price_1TuHqHInV3KLo0c7LutflX92",
      providerSubscriptionId: "sub_plan_change",
      status: "active",
    };
    const context = createContext(
      connection.db,
      connection.pool,
      env,
      testBilling,
    );
    const user = await context.repositories.user.create({
      email: "plan-change@example.com",
      emailVerifiedAt: new Date(),
      role: "user",
    });
    await context.repositories.billing.createCustomer({
      provider: "stripe",
      providerCustomerId: "cus_plan_change",
      userId: user.userId,
    });
    const billing = new BillingService({ context });
    await billing.processWebhook({ payload: "{}", signature: "test" });

    await billing.changeSubscription({
      billingInterval: "monthly",
      planKey: "pro",
      userId: user.userId,
    });
    await billing.changeSubscription({
      billingInterval: "yearly",
      planKey: "pro",
      userId: user.userId,
    });
    await billing.changeSubscription({
      billingInterval: "monthly",
      planKey: "starter",
      userId: user.userId,
    });

    const subscriptions = await connection.db.select().from(subscriptionsTable);

    expect(testBilling.changedSubscriptions).toEqual([
      {
        billingInterval: "monthly",
        planKey: "pro",
        providerSubscriptionId: "sub_plan_change",
        timing: "immediate",
      },
      {
        billingInterval: "yearly",
        planKey: "pro",
        providerSubscriptionId: "sub_plan_change",
        timing: "period_end",
      },
      {
        billingInterval: "monthly",
        planKey: "starter",
        providerSubscriptionId: "sub_plan_change",
        timing: "period_end",
      },
    ]);
    expect(subscriptions).toEqual([
      expect.objectContaining({
        billingInterval: "monthly",
        planKey: "pro",
        providerPriceId: "price_1TuHqSInV3KLo0c779ybsa9r",
        scheduledBillingInterval: "monthly",
        scheduledPlanKey: "starter",
      }),
    ]);
  } finally {
    await connection.pool.end();
    await root.db.execute(sql.raw(`DROP DATABASE ${databaseName}`));
    await root.pool.end();
  }
});

test("email changes sync to Stripe and account deletion cancels before removing local billing data", async () => {
  const env = initENV();
  const root = await initDB({
    connectionCredentials: env.POSTGRES_CONNECTION_STRING,
  });
  const databaseName = `test_${crypto.randomUUID().replaceAll("-", "_")}`;
  await root.db.execute(
    sql.raw(`CREATE DATABASE ${databaseName} TEMPLATE ${TEST_DB_TEMPLATE}`),
  );

  const connection = await initDB({
    connectionCredentials: {
      host: env.POSTGRES_HOST,
      name: databaseName,
      pass: env.POSTGRES_PASS,
      port: env.POSTGRES_PORT,
      user: env.POSTGRES_USER,
    },
  });

  try {
    const testBilling = new TestBilling();
    testBilling.providerEventId = "evt_account_lifecycle";
    testBilling.providerSubscriptionId = "sub_account_lifecycle";
    testBilling.snapshot = {
      billingInterval: "monthly",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
      currentPeriodStart: new Date("2026-07-01T00:00:00.000Z"),
      endedAt: null,
      localUserId: null,
      scheduledBillingInterval: null,
      scheduledPlanKey: null,
      planKey: "starter",
      provider: "stripe",
      providerCustomerId: "cus_account_lifecycle",
      providerPriceId: "price_1TuHqHInV3KLo0c7LutflX92",
      providerSubscriptionId: "sub_account_lifecycle",
      status: "active",
    };
    const context = createContext(
      connection.db,
      connection.pool,
      env,
      testBilling,
    );
    const user = await context.repositories.user.create({
      email: "before-change@example.com",
      emailVerifiedAt: new Date(),
      role: "user",
    });
    testBilling.snapshot = {
      ...testBilling.snapshot,
      localUserId: user.userId,
    };
    await context.repositories.billing.createCustomer({
      provider: "stripe",
      providerCustomerId: "cus_account_lifecycle",
      userId: user.userId,
    });
    const billing = new BillingService({ context });
    await billing.processWebhook({
      payload: "{}",
      signature: "test",
    });

    await new AuthService({ context }).changeEmail({
      email: "after-change@example.com",
      userId: user.userId,
    });
    const updatedUser = await context.repositories.user.findByUserId({
      userId: user.userId,
    });

    expect(testBilling.updatedCustomers).toEqual([
      {
        email: "after-change@example.com",
        providerCustomerId: "cus_account_lifecycle",
      },
    ]);
    expect(updatedUser?.email).toBe("after-change@example.com");

    await new UserService({ context }).remove({ userId: user.userId });
    await billing.reconcile();
    const users = await connection.db.select().from(usersTable);
    const customers = await connection.db.select().from(billingCustomersTable);
    const subscriptions = await connection.db.select().from(subscriptionsTable);

    expect(testBilling.immediatelyCancelledSubscriptionIds).toEqual([
      "sub_account_lifecycle",
    ]);
    expect(users).toEqual([]);
    expect(customers).toEqual([]);
    expect(subscriptions).toEqual([]);
  } finally {
    await connection.pool.end();
    await root.db.execute(sql.raw(`DROP DATABASE ${databaseName}`));
    await root.pool.end();
  }
});

test("reconciliation restores a missing local billing record from Stripe metadata", async () => {
  const env = initENV();
  const root = await initDB({
    connectionCredentials: env.POSTGRES_CONNECTION_STRING,
  });
  const databaseName = `test_${crypto.randomUUID().replaceAll("-", "_")}`;
  await root.db.execute(
    sql.raw(`CREATE DATABASE ${databaseName} TEMPLATE ${TEST_DB_TEMPLATE}`),
  );

  const connection = await initDB({
    connectionCredentials: {
      host: env.POSTGRES_HOST,
      name: databaseName,
      pass: env.POSTGRES_PASS,
      port: env.POSTGRES_PORT,
      user: env.POSTGRES_USER,
    },
  });

  try {
    const testBilling = new TestBilling();
    testBilling.providerSubscriptionId = "sub_reconciled";
    testBilling.snapshot = {
      billingInterval: "monthly",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
      currentPeriodStart: new Date("2026-07-01T00:00:00.000Z"),
      endedAt: null,
      localUserId: null,
      scheduledBillingInterval: null,
      scheduledPlanKey: null,
      planKey: "starter",
      provider: "stripe",
      providerCustomerId: "cus_reconciled",
      providerPriceId: "price_1TuHqHInV3KLo0c7LutflX92",
      providerSubscriptionId: "sub_reconciled",
      status: "active",
    };
    const context = createContext(
      connection.db,
      connection.pool,
      env,
      testBilling,
    );
    const user = await context.repositories.user.create({
      email: "recovery@example.com",
      emailVerifiedAt: new Date(),
      role: "user",
    });
    testBilling.snapshot = {
      ...testBilling.snapshot,
      localUserId: user.userId,
    };

    await new BillingService({ context }).reconcile();

    const customers = await connection.db.select().from(billingCustomersTable);
    const subscriptions = await connection.db.select().from(subscriptionsTable);

    expect(customers).toEqual([
      expect.objectContaining({
        providerCustomerId: "cus_reconciled",
        userId: user.userId,
      }),
    ]);
    expect(subscriptions).toEqual([
      expect.objectContaining({
        planKey: "starter",
        providerSubscriptionId: "sub_reconciled",
        status: "active",
      }),
    ]);
  } finally {
    await connection.pool.end();
    await root.db.execute(sql.raw(`DROP DATABASE ${databaseName}`));
    await root.pool.end();
  }
});

test("reconciliation skips subscriptions that do not belong to a local user", async () => {
  const env = initENV();
  const root = await initDB({
    connectionCredentials: env.POSTGRES_CONNECTION_STRING,
  });
  const databaseName = `test_${crypto.randomUUID().replaceAll("-", "_")}`;
  await root.db.execute(
    sql.raw(`CREATE DATABASE ${databaseName} TEMPLATE ${TEST_DB_TEMPLATE}`),
  );

  const connection = await initDB({
    connectionCredentials: {
      host: env.POSTGRES_HOST,
      name: databaseName,
      pass: env.POSTGRES_PASS,
      port: env.POSTGRES_PORT,
      user: env.POSTGRES_USER,
    },
  });

  try {
    const testBilling = new TestBilling();
    testBilling.providerSubscriptionIds = ["sub_external", "sub_recovered"];
    testBilling.snapshotsBySubscriptionId.set("sub_external", {
      billingInterval: "monthly",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
      currentPeriodStart: new Date("2026-07-01T00:00:00.000Z"),
      endedAt: null,
      localUserId: null,
      planKey: "starter",
      provider: "stripe",
      providerCustomerId: "cus_external",
      providerPriceId: "price_1TuHqHInV3KLo0c7LutflX92",
      providerSubscriptionId: "sub_external",
      scheduledBillingInterval: null,
      scheduledPlanKey: null,
      status: "active",
    });
    const context = createContext(
      connection.db,
      connection.pool,
      env,
      testBilling,
    );
    const user = await context.repositories.user.create({
      email: "reconciled@example.com",
      emailVerifiedAt: new Date(),
      role: "user",
    });
    testBilling.snapshotsBySubscriptionId.set("sub_recovered", {
      billingInterval: "monthly",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
      currentPeriodStart: new Date("2026-07-01T00:00:00.000Z"),
      endedAt: null,
      localUserId: user.userId,
      planKey: "starter",
      provider: "stripe",
      providerCustomerId: "cus_recovered",
      providerPriceId: "price_1TuHqHInV3KLo0c7LutflX92",
      providerSubscriptionId: "sub_recovered",
      scheduledBillingInterval: null,
      scheduledPlanKey: null,
      status: "active",
    });

    await new BillingService({ context }).reconcile();

    const customers = await connection.db.select().from(billingCustomersTable);
    const subscriptions = await connection.db.select().from(subscriptionsTable);
    expect(customers).toEqual([
      expect.objectContaining({
        providerCustomerId: "cus_recovered",
        userId: user.userId,
      }),
    ]);
    expect(subscriptions).toEqual([
      expect.objectContaining({
        providerSubscriptionId: "sub_recovered",
      }),
    ]);
  } finally {
    await connection.pool.end();
    await root.db.execute(sql.raw(`DROP DATABASE ${databaseName}`));
    await root.pool.end();
  }
});

test("payment failures notify the user after persisting the past-due subscription", async () => {
  const env = initENV();
  const root = await initDB({
    connectionCredentials: env.POSTGRES_CONNECTION_STRING,
  });
  const databaseName = `test_${crypto.randomUUID().replaceAll("-", "_")}`;
  await root.db.execute(
    sql.raw(`CREATE DATABASE ${databaseName} TEMPLATE ${TEST_DB_TEMPLATE}`),
  );

  const connection = await initDB({
    connectionCredentials: {
      host: env.POSTGRES_HOST,
      name: databaseName,
      pass: env.POSTGRES_PASS,
      port: env.POSTGRES_PORT,
      user: env.POSTGRES_USER,
    },
  });

  try {
    const testBilling = new TestBilling();
    testBilling.providerEventId = "evt_payment_failed";
    testBilling.providerSubscriptionId = "sub_payment_failed";
    testBilling.snapshot = {
      billingInterval: "monthly",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
      currentPeriodStart: new Date("2026-07-01T00:00:00.000Z"),
      endedAt: null,
      localUserId: null,
      scheduledBillingInterval: null,
      scheduledPlanKey: null,
      planKey: "starter",
      provider: "stripe",
      providerCustomerId: "cus_payment_failed",
      providerPriceId: "price_1TuHqHInV3KLo0c7LutflX92",
      providerSubscriptionId: "sub_payment_failed",
      status: "past_due",
    };
    testBilling.webhookType = "invoice.payment_failed";
    const testMailer = new TestMailer();
    const context = createContext(
      connection.db,
      connection.pool,
      env,
      testBilling,
      testMailer,
    );
    const user = await context.repositories.user.create({
      email: "payment-failed@example.com",
      emailVerifiedAt: new Date(),
      role: "user",
    });
    await context.repositories.billing.createCustomer({
      provider: "stripe",
      providerCustomerId: "cus_payment_failed",
      userId: user.userId,
    });

    const billing = new BillingService({ context });
    testMailer.shouldFail = true;
    await expect(
      billing.processWebhook({ payload: "{}", signature: "test" }),
    ).rejects.toThrow("Test mailer failed.");

    const subscriptionsAfterFailedNotification = await connection.db
      .select()
      .from(subscriptionsTable);
    const eventsAfterFailedNotification = await connection.db
      .select()
      .from(billingEventsTable);

    expect(subscriptionsAfterFailedNotification).toEqual([
      expect.objectContaining({
        pastDueAt: expect.any(Date),
        providerSubscriptionId: "sub_payment_failed",
        status: "past_due",
      }),
    ]);
    expect(eventsAfterFailedNotification).toEqual([
      expect.objectContaining({
        processedAt: null,
        providerEventId: "evt_payment_failed",
      }),
    ]);

    testMailer.shouldFail = false;
    await billing.processWebhook({ payload: "{}", signature: "test" });

    const subscriptions = await connection.db.select().from(subscriptionsTable);
    const events = await connection.db.select().from(billingEventsTable);

    expect(testMailer.emailsSent).toBe(2);
    expect(subscriptions).toEqual([
      expect.objectContaining({
        pastDueAt: expect.any(Date),
        providerSubscriptionId: "sub_payment_failed",
        status: "past_due",
      }),
    ]);
    expect(events).toEqual([
      expect.objectContaining({
        processedAt: expect.any(Date),
        providerEventId: "evt_payment_failed",
      }),
    ]);
  } finally {
    await connection.pool.end();
    await root.db.execute(sql.raw(`DROP DATABASE ${databaseName}`));
    await root.pool.end();
  }
});

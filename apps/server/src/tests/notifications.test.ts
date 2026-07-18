import { expect, test } from "bun:test";
import crypto from "crypto";
import { eq, sql } from "drizzle-orm";
import { initENV } from "@server/config/env";
import { initDB } from "@server/infrastructure/database/client";
import { notificationsTable } from "@server/infrastructure/database/schemas";
import { NotificationService } from "@server/services/notification";
import { BillingService } from "@server/services/billing";
import { TEST_DB_TEMPLATE } from "./setup";
import { createContext, TestBilling, TestMailer } from "./helpers/billing";

test("notifications persist in the database and are delivered by email", async () => {
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
    const mailer = new TestMailer();
    const context = createContext(
      connection.db,
      connection.pool,
      env,
      undefined,
      mailer,
    );
    const user = await context.repositories.user.create({
      email: "notifications@example.com",
      emailVerifiedAt: new Date(),
      role: "user",
    });
    const notifications = new NotificationService({ context });

    await notifications.send({
      body: "Update your payment method.",
      title: "Payment failed",
      type: "billing.payment_failed",
      userId: user.userId,
    });

    const storedNotifications = await connection.db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, user.userId));
    expect(storedNotifications).toEqual([
      expect.objectContaining({
        readAt: null,
        type: "billing.payment_failed",
      }),
    ]);
    expect(mailer.emailsSent).toBe(1);

    const storedNotification = storedNotifications.at(0);

    if (!storedNotification) {
      throw new Error("The notification was not persisted.");
    }

    await notifications.markRead({
      notificationId: storedNotification.notificationId,
      userId: user.userId,
    });

    const readNotification = await connection.db
      .select()
      .from(notificationsTable)
      .where(
        eq(
          notificationsTable.notificationId,
          storedNotification.notificationId,
        ),
      );
    expect(readNotification[0]?.readAt).toBeInstanceOf(Date);
  } finally {
    await connection.pool.end();
    await root.db.execute(sql.raw(`DROP DATABASE ${databaseName}`));
    await root.pool.end();
  }
});

test("Stripe lifecycle webhooks notify scheduled external cancellations once and only treat recurring invoices as renewals", async () => {
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
    const mailer = new TestMailer();
    const context = createContext(
      connection.db,
      connection.pool,
      env,
      testBilling,
      mailer,
    );
    const user = await context.repositories.user.create({
      email: "stripe-events@example.com",
      emailVerifiedAt: new Date(),
      role: "user",
    });
    const providerSubscriptionId = "sub_stripe_events";
    const providerCustomerId = "cus_stripe_events";
    testBilling.providerSubscriptionId = providerSubscriptionId;
    testBilling.providerEventId = "evt_subscription_created";
    testBilling.webhookType = "customer.subscription.created";
    testBilling.snapshot = {
      billingInterval: "monthly",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date("2027-01-01T00:00:00.000Z"),
      currentPeriodStart: new Date("2026-12-01T00:00:00.000Z"),
      endedAt: null,
      localUserId: null,
      planKey: "starter",
      provider: "stripe",
      providerCustomerId,
      providerPriceId: "price_1TuHqHInV3KLo0c7LutflX92",
      providerSubscriptionId,
      scheduledBillingInterval: null,
      scheduledPlanKey: null,
      status: "active",
    };
    await context.repositories.billing.createCustomer({
      provider: "stripe",
      providerCustomerId,
      userId: user.userId,
    });
    const billing = new BillingService({ context });

    await billing.processWebhook({ payload: "{}", signature: "test" });

    testBilling.providerEventId = "evt_first_invoice";
    testBilling.invoiceBillingReason = "subscription_create";
    testBilling.webhookType = "invoice.paid";
    await billing.processWebhook({ payload: "{}", signature: "test" });

    expect(await connection.db.select().from(notificationsTable)).toEqual([]);

    testBilling.providerEventId = "evt_renewal_invoice";
    testBilling.invoiceBillingReason = "subscription_cycle";
    await billing.processWebhook({ payload: "{}", signature: "test" });

    testBilling.providerEventId = "evt_portal_cancel";
    testBilling.invoiceBillingReason = null;
    testBilling.snapshot = {
      ...testBilling.snapshot,
      cancelAtPeriodEnd: true,
    };
    testBilling.webhookType = "customer.subscription.updated";
    await billing.processWebhook({ payload: "{}", signature: "test" });

    testBilling.providerEventId = "evt_subscription_deleted";
    testBilling.snapshot = {
      ...testBilling.snapshot,
      cancelAtPeriodEnd: false,
      endedAt: new Date("2027-01-01T00:00:00.000Z"),
      status: "canceled",
    };
    testBilling.webhookType = "customer.subscription.deleted";
    await billing.processWebhook({ payload: "{}", signature: "test" });

    const storedNotifications = await connection.db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, user.userId));
    expect(
      storedNotifications.map((notification) => notification.type),
    ).toEqual(["billing.renewed", "billing.subscription_canceled"]);

    const immediateBilling = new TestBilling();
    const immediateSubscriptionId = "sub_immediate_cancel";
    const immediateCustomerId = "cus_immediate_cancel";
    const immediateUser = await context.repositories.user.create({
      email: "immediate-cancel@example.com",
      emailVerifiedAt: new Date(),
      role: "user",
    });
    immediateBilling.providerSubscriptionId = immediateSubscriptionId;
    immediateBilling.providerEventId = "evt_immediate_created";
    immediateBilling.webhookType = "customer.subscription.created";
    immediateBilling.snapshot = {
      billingInterval: "monthly",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date("2027-01-01T00:00:00.000Z"),
      currentPeriodStart: new Date("2026-12-01T00:00:00.000Z"),
      endedAt: null,
      localUserId: null,
      planKey: "starter",
      provider: "stripe",
      providerCustomerId: immediateCustomerId,
      providerPriceId: "price_1TuHqHInV3KLo0c7LutflX92",
      providerSubscriptionId: immediateSubscriptionId,
      scheduledBillingInterval: null,
      scheduledPlanKey: null,
      status: "active",
    };
    await context.repositories.billing.createCustomer({
      provider: "stripe",
      providerCustomerId: immediateCustomerId,
      userId: immediateUser.userId,
    });
    const immediateCancellation = new BillingService({
      context: { ...context, billing: immediateBilling },
    });
    await immediateCancellation.processWebhook({
      payload: "{}",
      signature: "test",
    });

    immediateBilling.providerEventId = "evt_immediate_deleted";
    immediateBilling.snapshot = {
      ...immediateBilling.snapshot,
      endedAt: new Date("2026-12-15T00:00:00.000Z"),
      status: "canceled",
    };
    immediateBilling.webhookType = "customer.subscription.deleted";
    await immediateCancellation.processWebhook({
      payload: "{}",
      signature: "test",
    });

    const immediateNotifications = await connection.db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, immediateUser.userId));
    expect(immediateNotifications).toEqual([
      expect.objectContaining({ type: "billing.subscription_ended" }),
    ]);
    expect(mailer.emailsSent).toBe(3);
  } finally {
    await connection.pool.end();
    await root.db.execute(sql.raw(`DROP DATABASE ${databaseName}`));
    await root.pool.end();
  }
});

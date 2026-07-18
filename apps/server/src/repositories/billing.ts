import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import type { BillingInterval, BillingPlanKey } from "@repo/constants/billing";
import type {
  BillingProvider,
  BillingSubscriptionSnapshot,
  BillingSubscriptionStatus,
} from "@server/lib/base-billing";
import { BaseRepository } from "@server/lib/base-repository";
import {
  billingCustomersTable,
  billingEventsTable,
  checkoutAttemptsTable,
  subscriptionsTable,
} from "@server/infrastructure/database/schemas";

const accessStatuses: BillingSubscriptionStatus[] = [
  "active",
  "past_due",
  "trialing",
];

export class BillingRepository extends BaseRepository {
  public async acquireUserLock(input: { userId: number }): Promise<void> {
    await this.db.execute(sql`SELECT pg_advisory_xact_lock(${input.userId})`);
  }
  public async hasEverSubscribed(where: { userId: number }): Promise<boolean> {
    const subscriptions = await this.db
      .select({ subscriptionId: subscriptionsTable.subscriptionId })
      .from(subscriptionsTable)
      .innerJoin(
        billingCustomersTable,
        eq(
          subscriptionsTable.billingCustomerId,
          billingCustomersTable.billingCustomerId,
        ),
      )
      .where(eq(billingCustomersTable.userId, where.userId))
      .limit(1);

    return subscriptions.length > 0;
  }

  public async findCustomerByUserId(where: { userId: number }) {
    const customers = await this.db
      .select()
      .from(billingCustomersTable)
      .where(eq(billingCustomersTable.userId, where.userId))
      .limit(1);

    return customers.at(0) ?? null;
  }

  public async findCustomerByProviderCustomerId(where: {
    providerCustomerId: string;
  }) {
    const customers = await this.db
      .select()
      .from(billingCustomersTable)
      .where(
        eq(billingCustomersTable.providerCustomerId, where.providerCustomerId),
      )
      .limit(1);

    return customers.at(0) ?? null;
  }

  public async createCustomer(input: {
    provider: BillingProvider;
    providerCustomerId: string;
    userId: number;
  }) {
    const customers = await this.db
      .insert(billingCustomersTable)
      .values(input)
      .returning();

    return customers.at(0)!;
  }

  public async findCurrentSubscription(where: { userId: number }) {
    const subscriptions = await this.db
      .select({
        subscription: subscriptionsTable,
      })
      .from(subscriptionsTable)
      .innerJoin(
        billingCustomersTable,
        eq(
          subscriptionsTable.billingCustomerId,
          billingCustomersTable.billingCustomerId,
        ),
      )
      .where(
        and(
          eq(billingCustomersTable.userId, where.userId),
          or(
            inArray(subscriptionsTable.status, accessStatuses),
            and(
              eq(subscriptionsTable.status, "canceled"),
              eq(subscriptionsTable.cancelAtPeriodEnd, true),
              gt(subscriptionsTable.currentPeriodEnd, new Date()),
            ),
          ),
        ),
      )
      .orderBy(desc(subscriptionsTable.createdAt))
      .limit(1);

    return subscriptions.at(0)?.subscription ?? null;
  }

  public async findSubscriptionByProviderSubscriptionId(where: {
    providerSubscriptionId: string;
  }) {
    const subscriptions = await this.db
      .select()
      .from(subscriptionsTable)
      .where(
        eq(
          subscriptionsTable.providerSubscriptionId,
          where.providerSubscriptionId,
        ),
      )
      .limit(1);

    return subscriptions.at(0) ?? null;
  }

  public async listSubscriptionsForReconciliation() {
    return await this.db
      .select()
      .from(subscriptionsTable)
      .where(
        inArray(subscriptionsTable.status, [
          "active",
          "incomplete",
          "past_due",
          "paused",
          "trialing",
          "unpaid",
        ]),
      );
  }

  public async findActiveCheckoutAttempt(where: { userId: number }) {
    const attempts = await this.db
      .select()
      .from(checkoutAttemptsTable)
      .where(
        and(
          eq(checkoutAttemptsTable.userId, where.userId),
          gt(checkoutAttemptsTable.expiresAt, new Date()),
          isNull(checkoutAttemptsTable.completedAt),
        ),
      )
      .orderBy(desc(checkoutAttemptsTable.createdAt))
      .limit(1);

    return attempts.at(0) ?? null;
  }

  public async createCheckoutAttempt(input: {
    billingInterval: BillingInterval;
    expiresAt: Date;
    planKey: BillingPlanKey;
    provider: BillingProvider;
    userId: number;
  }) {
    const attempts = await this.db
      .insert(checkoutAttemptsTable)
      .values(input)
      .returning();

    return attempts.at(0)!;
  }

  public async setCheckoutSession(input: {
    checkoutAttemptId: number;
    expiresAt: Date;
    providerCheckoutSessionId: string;
  }): Promise<void> {
    await this.db
      .update(checkoutAttemptsTable)
      .set({
        expiresAt: input.expiresAt,
        providerCheckoutSessionId: input.providerCheckoutSessionId,
      })
      .where(
        eq(checkoutAttemptsTable.checkoutAttemptId, input.checkoutAttemptId),
      );
  }

  public async removeCheckoutAttempt(where: {
    checkoutAttemptId: number;
  }): Promise<void> {
    await this.db
      .delete(checkoutAttemptsTable)
      .where(
        eq(checkoutAttemptsTable.checkoutAttemptId, where.checkoutAttemptId),
      );
  }

  public async claimEvent(input: {
    payload: unknown;
    provider: BillingProvider;
    providerEventId: string;
    type: string;
  }) {
    const events = await this.db
      .insert(billingEventsTable)
      .values(input)
      .onConflictDoNothing()
      .returning();

    return events.at(0) ?? null;
  }

  public async findEventByProviderEventId(where: { providerEventId: string }) {
    const events = await this.db
      .select()
      .from(billingEventsTable)
      .where(eq(billingEventsTable.providerEventId, where.providerEventId))
      .limit(1);

    return events.at(0) ?? null;
  }

  public async markEventProcessed(where: {
    billingEventId: number;
  }): Promise<void> {
    await this.db
      .update(billingEventsTable)
      .set({ processedAt: new Date() })
      .where(eq(billingEventsTable.billingEventId, where.billingEventId));
  }

  public async markCheckoutAttemptCompleted(where: {
    providerCheckoutSessionId: string;
  }): Promise<void> {
    await this.db
      .update(checkoutAttemptsTable)
      .set({ completedAt: new Date() })
      .where(
        eq(
          checkoutAttemptsTable.providerCheckoutSessionId,
          where.providerCheckoutSessionId,
        ),
      );
  }

  public async upsertSubscription(input: {
    billingCustomerId: number;
    snapshot: BillingSubscriptionSnapshot;
  }): Promise<void> {
    const existing = await this.db
      .select({ pastDueAt: subscriptionsTable.pastDueAt })
      .from(subscriptionsTable)
      .where(
        eq(
          subscriptionsTable.providerSubscriptionId,
          input.snapshot.providerSubscriptionId,
        ),
      )
      .limit(1);
    const existingPastDueAt = existing.at(0)?.pastDueAt ?? null;
    const pastDueAt =
      input.snapshot.status === "past_due"
        ? (existingPastDueAt ?? new Date())
        : null;

    await this.db
      .insert(subscriptionsTable)
      .values({
        billingCustomerId: input.billingCustomerId,
        billingInterval: input.snapshot.billingInterval,
        cancelAtPeriodEnd: input.snapshot.cancelAtPeriodEnd,
        currentPeriodEnd: input.snapshot.currentPeriodEnd,
        currentPeriodStart: input.snapshot.currentPeriodStart,
        endedAt: input.snapshot.endedAt,
        pastDueAt,
        planKey: input.snapshot.planKey,
        provider: input.snapshot.provider,
        providerPriceId: input.snapshot.providerPriceId,
        providerSubscriptionId: input.snapshot.providerSubscriptionId,
        scheduledBillingInterval: input.snapshot.scheduledBillingInterval,
        scheduledPlanKey: input.snapshot.scheduledPlanKey,
        status: input.snapshot.status,
      })
      .onConflictDoUpdate({
        target: subscriptionsTable.providerSubscriptionId,
        set: {
          billingInterval: input.snapshot.billingInterval,
          cancelAtPeriodEnd: input.snapshot.cancelAtPeriodEnd,
          currentPeriodEnd: input.snapshot.currentPeriodEnd,
          currentPeriodStart: input.snapshot.currentPeriodStart,
          endedAt: input.snapshot.endedAt,
          pastDueAt,
          planKey: input.snapshot.planKey,
          providerPriceId: input.snapshot.providerPriceId,
          scheduledBillingInterval: input.snapshot.scheduledBillingInterval,
          scheduledPlanKey: input.snapshot.scheduledPlanKey,
          status: input.snapshot.status,
          updatedAt: new Date(),
        },
      });
  }
}

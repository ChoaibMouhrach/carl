import {
  getBillingPlan,
  isBillingPlanKey,
  type BillingInterval,
  type BillingPlanKey,
} from "@repo/constants/billing";
import type { NotificationType } from "@repo/constants/notifications";
import type { BillingSubscriptionSnapshot } from "@server/lib/base-billing";
import { BadRequestError, NotFoundError } from "@server/lib/errors";
import { BaseService } from "@server/lib/base-service";
import type { subscriptionsTable } from "@server/infrastructure/database/schemas";
import { NotificationService } from "./notification";

type PreviousSubscription = typeof subscriptionsTable.$inferSelect;

export class BillingService extends BaseService {
  public async getOnboarding(input: { userId: string }) {
    const hasEverSubscribed =
      await this.context.repositories.billing.hasEverSubscribed({
        userId: input.userId,
      });

    return { needsOnboarding: !hasEverSubscribed };
  }

  public async getSubscription(input: { userId: string }) {
    const subscription =
      await this.context.repositories.billing.findCurrentSubscription({
        userId: input.userId,
      });

    return { subscription };
  }

  public async createCheckoutSession(input: {
    billingInterval: BillingInterval;
    email: string;
    planKey: BillingPlanKey;
    userId: string;
  }): Promise<{ url: string }> {
    const attempt = await this.context.repositories.transaction(
      async ({ tx }) => {
        await tx.billing.acquireUserLock({ userId: input.userId });

        const currentSubscription = await tx.billing.findCurrentSubscription({
          userId: input.userId,
        });

        if (currentSubscription) {
          throw new BadRequestError({
            message: "An active subscription already exists for this account.",
            code: "subscriptionExists",
          });
        }

        const existingAttempt = await tx.billing.findActiveCheckoutAttempt({
          userId: input.userId,
        });

        if (existingAttempt) {
          if (existingAttempt.providerCheckoutSessionId) {
            return { existingAttempt };
          }

          throw new BadRequestError({
            message: "A checkout session is already active for this account.",
            code: "checkoutActive",
          });
        }

        const createdAttempt = await tx.billing.createCheckoutAttempt({
          billingInterval: input.billingInterval,
          expiresAt: new Date(Date.now() + 5 * 60 * 1_000),
          planKey: input.planKey,
          provider: this.context.billing.provider,
          userId: input.userId,
        });

        return { createdAttempt };
      },
    );

    if (attempt.existingAttempt) {
      const providerCheckoutSessionId =
        attempt.existingAttempt.providerCheckoutSessionId;

      if (!providerCheckoutSessionId) {
        throw new Error("Active checkout attempt has no Stripe session.");
      }

      const checkoutSession = await this.context.billing.getCheckoutSession({
        providerCheckoutSessionId,
      });

      if (checkoutSession.url) {
        return { url: checkoutSession.url };
      }

      await this.context.repositories.billing.removeCheckoutAttempt({
        checkoutAttemptId: attempt.existingAttempt.checkoutAttemptId,
      });

      return await this.createCheckoutSession(input);
    }

    const createdAttempt = attempt.createdAttempt;

    if (!createdAttempt) {
      throw new Error("Checkout attempt was not created.");
    }

    try {
      const customer = await this.getOrCreateCustomer({
        email: input.email,
        userId: input.userId,
      });
      const session = await this.context.billing.createCheckoutSession({
        billingInterval: input.billingInterval,
        customerId: customer.providerCustomerId,
        idempotencyKey: `checkout-attempt:${createdAttempt.checkoutAttemptId}`,
        planKey: input.planKey,
        userId: input.userId,
      });

      await this.context.repositories.billing.setCheckoutSession({
        checkoutAttemptId: createdAttempt.checkoutAttemptId,
        expiresAt: session.expiresAt,
        providerCheckoutSessionId: session.providerCheckoutSessionId,
      });

      return { url: session.url };
    } catch (error: unknown) {
      await this.context.repositories.billing.removeCheckoutAttempt({
        checkoutAttemptId: createdAttempt.checkoutAttemptId,
      });

      throw error;
    }
  }

  public async createPortalSession(input: { userId: string }) {
    const customer =
      await this.context.repositories.billing.findCustomerByUserId({
        userId: input.userId,
      });

    if (!customer) {
      throw new NotFoundError({
        message: "No billing customer exists for this account.",
        code: "noBillingCustomer",
      });
    }

    return await this.context.billing.createPortalSession({
      providerCustomerId: customer.providerCustomerId,
    });
  }

  public async cancelSubscription(input: { userId: string }): Promise<void> {
    const subscription =
      await this.context.repositories.billing.findCurrentSubscription({
        userId: input.userId,
      });

    if (!subscription) {
      throw new NotFoundError({
        message: "No active subscription exists.",
        code: "noActiveSubscription",
      });
    }

    await this.context.billing.cancelSubscription({
      providerSubscriptionId: subscription.providerSubscriptionId,
    });
    await this.syncSubscription({
      providerSubscriptionId: subscription.providerSubscriptionId,
    });
  }

  public async resumeSubscription(input: { userId: string }): Promise<void> {
    const subscription =
      await this.context.repositories.billing.findCurrentSubscription({
        userId: input.userId,
      });

    if (
      !subscription ||
      !subscription.cancelAtPeriodEnd ||
      !subscription.currentPeriodEnd ||
      subscription.currentPeriodEnd <= new Date()
    ) {
      throw new BadRequestError({
        message: "This subscription can no longer be resumed.",
        code: "subscriptionNotResumable",
      });
    }

    await this.context.billing.resumeSubscription({
      providerSubscriptionId: subscription.providerSubscriptionId,
    });
    await this.syncSubscription({
      providerSubscriptionId: subscription.providerSubscriptionId,
    });
  }

  public async changeSubscription(input: {
    billingInterval: BillingInterval;
    planKey: BillingPlanKey;
    userId: string;
  }): Promise<void> {
    const subscription =
      await this.context.repositories.billing.findCurrentSubscription({
        userId: input.userId,
      });

    if (!subscription) {
      throw new NotFoundError({
        message: "No active subscription exists.",
        code: "noActiveSubscription",
      });
    }

    if (
      subscription.planKey === input.planKey &&
      subscription.billingInterval === input.billingInterval
    ) {
      throw new BadRequestError({
        message: "The selected plan is already active.",
        code: "planAlreadyActive",
      });
    }

    if (!isBillingPlanKey(subscription.planKey)) {
      throw new BadRequestError({
        message: "The current billing plan is invalid.",
        code: "currentPlanInvalid",
      });
    }

    const currentPlan = getBillingPlan(subscription.planKey);
    const targetPlan = getBillingPlan(input.planKey);

    if (!currentPlan || !targetPlan) {
      throw new BadRequestError({
        message: "The billing plan is invalid.",
        code: "planInvalid",
      });
    }

    const timing =
      targetPlan.order > currentPlan.order ? "immediate" : "period_end";

    await this.context.billing.changeSubscription({
      billingInterval: input.billingInterval,
      planKey: input.planKey,
      providerSubscriptionId: subscription.providerSubscriptionId,
      timing,
    });

    await this.syncSubscription({
      providerSubscriptionId: subscription.providerSubscriptionId,
    });
  }

  public async processWebhook(input: { payload: string; signature: string }) {
    const event = await this.context.billing.verifyWebhook(input);
    await this.context.logger.info({
      msg: "webhook received",
      providerEventId: event.providerEventId,
      providerSubscriptionId: event.providerSubscriptionId,
      type: event.type,
    });
    const claimed = await this.context.repositories.billing.claimEvent({
      payload: event.payload,
      provider: this.context.billing.provider,
      providerEventId: event.providerEventId,
      type: event.type,
    });

    const billingEvent =
      claimed ??
      (await this.context.repositories.billing.findEventByProviderEventId({
        providerEventId: event.providerEventId,
      }));

    if (!billingEvent || billingEvent.processedAt) {
      await this.context.logger.info({
        msg: "webhook skipped (already processed or missing)",
        alreadyProcessed: !!billingEvent?.processedAt,
        providerEventId: event.providerEventId,
      });
      return;
    }

    if (event.providerCheckoutSessionId) {
      await this.context.repositories.billing.markCheckoutAttemptCompleted({
        providerCheckoutSessionId: event.providerCheckoutSessionId,
      });
    }

    if (!event.providerSubscriptionId) {
      await this.context.repositories.billing.markEventProcessed({
        billingEventId: billingEvent.billingEventId,
      });

      return;
    }

    const webhookNotification = this.getWebhookNotification({
      invoiceBillingReason: event.invoiceBillingReason,
      type: event.type,
    });
    const shouldDeferEventProcessing =
      webhookNotification !== null ||
      event.type === "customer.subscription.deleted" ||
      event.type === "customer.subscription.updated";
    const synchronizedSubscription = await this.syncSubscription({
      billingEventId: billingEvent.billingEventId,
      deferEventProcessing: shouldDeferEventProcessing,
      eventType: event.type,
      providerSubscriptionId: event.providerSubscriptionId,
    });

    if (!synchronizedSubscription) {
      await this.context.logger.info({
        msg: "webhook sync returned null — customer not resolved",
        providerEventId: event.providerEventId,
        providerSubscriptionId: event.providerSubscriptionId,
      });
      return;
    }

    await this.context.logger.info({
      msg: "webhook synced",
      cancelAtPeriodEnd: synchronizedSubscription.snapshot.cancelAtPeriodEnd,
      previousCancelAtPeriodEnd:
        synchronizedSubscription.previous?.cancelAtPeriodEnd ?? null,
      providerEventId: event.providerEventId,
      status: synchronizedSubscription.snapshot.status,
      userId: synchronizedSubscription.userId,
    });

    if (webhookNotification) {
      await new NotificationService({ context: this.context }).send({
        ...webhookNotification,
        data: { link: "/user/billing" },
        userId: synchronizedSubscription.userId,
      });

      await this.context.repositories.billing.markEventProcessed({
        billingEventId: billingEvent.billingEventId,
      });
    } else if (shouldDeferEventProcessing) {
      await this.context.repositories.billing.markEventProcessed({
        billingEventId: billingEvent.billingEventId,
      });
    }
  }

  public async reconcile(): Promise<void> {
    const localSubscriptions =
      await this.context.repositories.billing.listSubscriptionsForReconciliation();
    const providerSubscriptionIds =
      await this.context.billing.listSubscriptionIds();
    const subscriptionIds = new Set([
      ...localSubscriptions.map(
        (subscription) => subscription.providerSubscriptionId,
      ),
      ...providerSubscriptionIds,
    ]);

    for (const providerSubscriptionId of subscriptionIds) {
      try {
        await this.syncSubscription({
          providerSubscriptionId,
        });
      } catch (error: unknown) {
        await this.context.logger.info({
          error: String(error),
          providerSubscriptionId,
        });
      }
    }
  }

  private async syncSubscription(input: {
    billingEventId?: number;
    deferEventProcessing?: boolean;
    eventType?: string;
    providerSubscriptionId: string;
  }): Promise<{
    previous: PreviousSubscription | null;
    snapshot: BillingSubscriptionSnapshot;
    userId: string;
  } | null> {
    const snapshot = await this.context.billing.getSubscriptionSnapshot({
      providerSubscriptionId: input.providerSubscriptionId,
    });
    const customer = await this.resolveBillingCustomer(snapshot);

    if (!customer) {
      if (input.billingEventId) {
        await this.context.repositories.billing.markEventProcessed({
          billingEventId: input.billingEventId,
        });
      }

      return null;
    }

    const previous = await this.context.repositories.transaction(
      async ({ tx }) => {
        const existing =
          await tx.billing.findSubscriptionByProviderSubscriptionId({
            providerSubscriptionId: input.providerSubscriptionId,
          });

        await tx.billing.upsertSubscription({
          billingCustomerId: customer.billingCustomerId,
          snapshot,
        });
        if (input.billingEventId && !input.deferEventProcessing) {
          await tx.billing.markEventProcessed({
            billingEventId: input.billingEventId,
          });
        }

        return existing;
      },
    );

    const transition = this.getSubscriptionTransitionNotification({
      eventType: input.eventType ?? "",
      previous,
      snapshot,
    });

    if (transition) {
      await new NotificationService({ context: this.context }).send({
        ...transition,
        data: { link: "/user/billing" },
        userId: customer.userId,
      });
    }

    return { previous, snapshot, userId: customer.userId };
  }

  private getWebhookNotification(input: {
    invoiceBillingReason: string | null;
    type: string;
  }): {
    body: string;
    title: string;
    type:
      | "billing.payment_failed"
      | "billing.renewed"
      | "billing.subscription_canceled"
      | "billing.trial_ending";
  } | null {
    if (input.type === "invoice.payment_failed") {
      return {
        body: "Your subscription payment failed. Update your payment method to keep your access.",
        title: "Action needed: update your payment method",
        type: "billing.payment_failed",
      };
    }

    if (input.type === "customer.subscription.trial_will_end") {
      return {
        body: "Your trial is ending soon. Choose a plan to keep access.",
        title: "Your trial is ending soon",
        type: "billing.trial_ending",
      };
    }

    if (
      input.type === "invoice.paid" &&
      input.invoiceBillingReason === "subscription_cycle"
    ) {
      return {
        body: "Your subscription payment was received.",
        title: "Your subscription was renewed",
        type: "billing.renewed",
      };
    }

    return null;
  }

  private getSubscriptionTransitionNotification(input: {
    eventType: string;
    previous: PreviousSubscription | null;
    snapshot: BillingSubscriptionSnapshot;
  }): {
    body: string;
    title: string;
    type: NotificationType;
  } | null {
    const { eventType, previous, snapshot } = input;

    if (eventType === "customer.subscription.deleted") {
      if (previous?.cancelAtPeriodEnd) return null;

      return {
        body: "Your subscription has ended and access is no longer active.",
        title: "Your subscription has ended",
        type: "billing.subscription_ended",
      };
    }

    if (previous?.cancelAtPeriodEnd && !snapshot.cancelAtPeriodEnd) {
      return {
        body: "Your subscription is active again and will renew automatically.",
        title: "Your subscription was resumed",
        type: "billing.subscription_resumed",
      };
    }

    if (!previous?.cancelAtPeriodEnd && snapshot.cancelAtPeriodEnd) {
      return {
        body: "Your subscription will end at the close of the current billing period.",
        title: "Your subscription has been canceled",
        type: "billing.subscription_canceled",
      };
    }

    if (previous && previous.planKey !== snapshot.planKey) {
      const previousOrder = isBillingPlanKey(previous.planKey)
        ? (getBillingPlan(previous.planKey)?.order ?? 0)
        : 0;

      const nextOrder = getBillingPlan(snapshot.planKey)?.order ?? 0;

      if (nextOrder > previousOrder) {
        return {
          body: `You're now on the ${snapshot.planKey} plan.`,
          title: "Your plan was upgraded",
          type: "billing.plan_upgraded",
        };
      }
    }

    if (
      snapshot.scheduledPlanKey &&
      snapshot.scheduledPlanKey !== previous?.scheduledPlanKey
    ) {
      return {
        body: `You'll switch to the ${snapshot.scheduledPlanKey} plan at your next renewal.`,
        title: "Plan change scheduled",
        type: "billing.plan_downgrade_scheduled",
      };
    }

    return null;
  }

  private async resolveBillingCustomer(snapshot: {
    localUserId: string | null;
    provider: "stripe";
    providerCustomerId: string;
  }) {
    const providerCustomer =
      await this.context.repositories.billing.findCustomerByProviderCustomerId({
        providerCustomerId: snapshot.providerCustomerId,
      });

    if (providerCustomer) {
      return providerCustomer;
    }

    if (!snapshot.localUserId) {
      await this.context.logger.info({
        msg: "resolveBillingCustomer failed — no localUserId in Stripe metadata",
        providerCustomerId: snapshot.providerCustomerId,
      });
      return null;
    }

    const userId = snapshot.localUserId;

    return await this.context.repositories.transaction(async ({ tx }) => {
      await tx.billing.acquireUserLock({ userId });

      const existingProviderCustomer =
        await tx.billing.findCustomerByProviderCustomerId({
          providerCustomerId: snapshot.providerCustomerId,
        });

      if (existingProviderCustomer) {
        return existingProviderCustomer;
      }

      const existingUserCustomer = await tx.billing.findCustomerByUserId({
        userId,
      });

      if (existingUserCustomer) {
        throw new NotFoundError({
          message:
            "Stripe subscription customer does not match the local user.",
          code: "stripeCustomerMismatch",
        });
      }

      const user = await tx.user.findByUserId({ userId });

      if (!user) {
        return null;
      }

      return await tx.billing.createCustomer({
        provider: snapshot.provider,
        providerCustomerId: snapshot.providerCustomerId,
        userId: user.id,
      });
    });
  }

  private async getOrCreateCustomer(input: { email: string; userId: string }) {
    const existing =
      await this.context.repositories.billing.findCustomerByUserId({
        userId: input.userId,
      });

    if (existing) {
      return existing;
    }

    const providerCustomer = await this.context.billing.createCustomer(input);

    return await this.context.repositories.billing.createCustomer({
      provider: this.context.billing.provider,
      providerCustomerId: providerCustomer.providerCustomerId,
      userId: input.userId,
    });
  }
}

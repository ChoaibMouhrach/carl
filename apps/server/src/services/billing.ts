import {
  getBillingPlan,
  isBillingPlanKey,
  type BillingInterval,
  type BillingPlanKey,
} from "@repo/constants/billing";
import { BadRequestError, NotFoundError } from "@server/lib/errors";
import { BaseService } from "@server/lib/base-service";

export class BillingService extends BaseService {
  public async getSubscription(input: { userId: number }) {
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
    userId: number;
  }) {
    const attempt = await this.context.repositories.transaction(
      async ({ tx }) => {
        await tx.billing.acquireUserLock({ userId: input.userId });

        const currentSubscription = await tx.billing.findCurrentSubscription({
          userId: input.userId,
        });

        if (currentSubscription) {
          throw new BadRequestError({
            message: "An active subscription already exists for this account.",
          });
        }

        const existingAttempt = await tx.billing.findActiveCheckoutAttempt({
          userId: input.userId,
        });

        if (existingAttempt) {
          throw new BadRequestError({
            message: "A checkout session is already active for this account.",
          });
        }

        return await tx.billing.createCheckoutAttempt({
          billingInterval: input.billingInterval,
          expiresAt: new Date(Date.now() + 5 * 60 * 1_000),
          planKey: input.planKey,
          provider: this.context.billing.provider,
          userId: input.userId,
        });
      },
    );

    try {
      const customer = await this.getOrCreateCustomer({
        email: input.email,
        userId: input.userId,
      });
      const session = await this.context.billing.createCheckoutSession({
        billingInterval: input.billingInterval,
        customerId: customer.providerCustomerId,
        idempotencyKey: `checkout-attempt:${attempt.checkoutAttemptId}`,
        planKey: input.planKey,
        userId: input.userId,
      });

      await this.context.repositories.billing.setCheckoutSession({
        checkoutAttemptId: attempt.checkoutAttemptId,
        expiresAt: session.expiresAt,
        providerCheckoutSessionId: session.providerCheckoutSessionId,
      });

      return { url: session.url };
    } catch (error: unknown) {
      await this.context.repositories.billing.removeCheckoutAttempt({
        checkoutAttemptId: attempt.checkoutAttemptId,
      });

      throw error;
    }
  }

  public async createPortalSession(input: { userId: number }) {
    const customer =
      await this.context.repositories.billing.findCustomerByUserId({
        userId: input.userId,
      });

    if (!customer) {
      throw new NotFoundError({
        message: "No billing customer exists for this account.",
      });
    }

    return await this.context.billing.createPortalSession({
      providerCustomerId: customer.providerCustomerId,
    });
  }

  public async cancelSubscription(input: { userId: number }): Promise<void> {
    const subscription =
      await this.context.repositories.billing.findCurrentSubscription({
        userId: input.userId,
      });

    if (!subscription) {
      throw new NotFoundError({ message: "No active subscription exists." });
    }

    await this.context.billing.cancelSubscription({
      providerSubscriptionId: subscription.providerSubscriptionId,
    });
    await this.syncSubscription({
      providerSubscriptionId: subscription.providerSubscriptionId,
    });
  }

  public async resumeSubscription(input: { userId: number }): Promise<void> {
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
    userId: number;
  }): Promise<void> {
    const subscription =
      await this.context.repositories.billing.findCurrentSubscription({
        userId: input.userId,
      });

    if (!subscription) {
      throw new NotFoundError({ message: "No active subscription exists." });
    }

    if (subscription.cancelAtPeriodEnd) {
      throw new BadRequestError({
        message: "Resume the subscription before changing its plan.",
      });
    }

    if (
      subscription.planKey === input.planKey &&
      subscription.billingInterval === input.billingInterval
    ) {
      throw new BadRequestError({
        message: "The selected plan is already active.",
      });
    }

    if (!isBillingPlanKey(subscription.planKey)) {
      throw new BadRequestError({
        message: "The current billing plan is invalid.",
      });
    }

    const currentPlan = getBillingPlan(subscription.planKey);
    const targetPlan = getBillingPlan(input.planKey);

    if (!currentPlan || !targetPlan) {
      throw new BadRequestError({ message: "The billing plan is invalid." });
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

    const shouldNotifyPaymentFailure = event.type === "invoice.payment_failed";
    const synchronizedSubscription = await this.syncSubscription({
      billingEventId: billingEvent.billingEventId,
      deferEventProcessing: shouldNotifyPaymentFailure,
      providerSubscriptionId: event.providerSubscriptionId,
    });

    if (!synchronizedSubscription) {
      return;
    }

    const { userId } = synchronizedSubscription;

    if (shouldNotifyPaymentFailure) {
      const user = await this.context.repositories.user.findByUserId({
        userId,
      });

      if (user) {
        await this.context.mailer.email({
          from: "billing",
          html: "Your subscription payment failed. Update your payment method to keep your access.",
          subject: "Action needed: update your payment method",
          to: [user.email],
        });
      }

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
    providerSubscriptionId: string;
  }): Promise<{ userId: number } | null> {
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

    await this.context.repositories.transaction(async ({ tx }) => {
      await tx.billing.upsertSubscription({
        billingCustomerId: customer.billingCustomerId,
        snapshot,
      });
      if (input.billingEventId && !input.deferEventProcessing) {
        await tx.billing.markEventProcessed({
          billingEventId: input.billingEventId,
        });
      }
    });

    return { userId: customer.userId };
  }

  private async resolveBillingCustomer(snapshot: {
    localUserId: number | null;
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

    if (!snapshot.localUserId) return null;

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
        });
      }

      const user = await tx.user.findByUserId({ userId });

      if (!user) {
        return null;
      }

      return await tx.billing.createCustomer({
        provider: snapshot.provider,
        providerCustomerId: snapshot.providerCustomerId,
        userId: user.userId,
      });
    });
  }

  private async getOrCreateCustomer(input: { email: string; userId: number }) {
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

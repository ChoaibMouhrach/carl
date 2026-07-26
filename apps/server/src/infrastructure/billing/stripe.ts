import Stripe from "stripe";
import {
  getBillingPrice,
  getStripePriceId,
  type BillingInterval,
  type BillingPlanKey,
} from "@repo/constants/billing";
import {
  BaseBilling,
  type BillingSubscriptionSnapshot,
  type BillingSubscriptionStatus,
} from "@server/lib/base-billing";

interface StripeBillingConstructorProps {
  cancelUrl: string;
  portalReturnUrl: string;
  secretKey: string;
  successUrl: string;
  webhookSecret: string;
}

export class StripeBilling extends BaseBilling {
  public override readonly provider = "stripe";

  private readonly stripe;
  private readonly props;

  public constructor(props: StripeBillingConstructorProps) {
    super();
    this.props = props;
    this.stripe = new Stripe(props.secretKey);
  }

  public override async createCustomer(input: {
    email: string;
    userId: string;
  }): Promise<{ providerCustomerId: string }> {
    const customer = await this.stripe.customers.create({
      email: input.email,
      metadata: { localUserId: String(input.userId) },
    });

    return { providerCustomerId: customer.id };
  }

  public override async createCheckoutSession(input: {
    billingInterval: BillingInterval;
    customerId: string;
    idempotencyKey: string;
    planKey: BillingPlanKey;
    userId: string;
  }): Promise<{
    expiresAt: Date;
    providerCheckoutSessionId: string;
    url: string;
  }> {
    const session = await this.stripe.checkout.sessions.create(
      {
        cancel_url: this.props.cancelUrl,
        client_reference_id: String(input.userId),
        customer: input.customerId,
        line_items: [
          {
            price: getStripePriceId(input.planKey, input.billingInterval),
            quantity: 1,
          },
        ],
        metadata: { localUserId: String(input.userId) },
        mode: "subscription",
        subscription_data: {
          metadata: { localUserId: String(input.userId) },
        },
        success_url: this.props.successUrl,
      },
      { idempotencyKey: input.idempotencyKey },
    );

    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL.");
    }

    return {
      expiresAt: new Date(session.expires_at * 1_000),
      providerCheckoutSessionId: session.id,
      url: session.url,
    };
  }

  public override async getCheckoutSession(input: {
    providerCheckoutSessionId: string;
  }): Promise<{ url: string | null }> {
    const session = await this.stripe.checkout.sessions.retrieve(
      input.providerCheckoutSessionId,
    );

    return { url: session.url };
  }

  public override async createPortalSession(input: {
    providerCustomerId: string;
  }): Promise<{ url: string }> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: input.providerCustomerId,
      return_url: this.props.portalReturnUrl,
    });

    return { url: session.url };
  }

  public override async cancelSubscription(input: {
    providerSubscriptionId: string;
  }): Promise<void> {
    const subscription = await this.stripe.subscriptions.retrieve(
      input.providerSubscriptionId,
    );
    const schedule = await this.getSchedule(subscription);

    if (schedule) {
      await this.stripe.subscriptionSchedules.release(schedule.id);
    }

    await this.stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: true,
    });
  }

  public override async cancelSubscriptionImmediately(input: {
    providerSubscriptionId: string;
  }): Promise<void> {
    const subscription = await this.stripe.subscriptions.retrieve(
      input.providerSubscriptionId,
    );
    const schedule = await this.getSchedule(subscription);

    if (schedule) {
      await this.stripe.subscriptionSchedules.release(schedule.id);
    }

    await this.stripe.subscriptions.cancel(input.providerSubscriptionId);
  }

  public override async updateCustomerEmail(input: {
    email: string;
    providerCustomerId: string;
  }): Promise<void> {
    await this.stripe.customers.update(input.providerCustomerId, {
      email: input.email,
    });
  }

  public override async resumeSubscription(input: {
    providerSubscriptionId: string;
  }): Promise<void> {
    const subscription = await this.stripe.subscriptions.retrieve(
      input.providerSubscriptionId,
    );
    const schedule = await this.getSchedule(subscription);

    if (schedule) {
      await this.stripe.subscriptionSchedules.release(schedule.id);
    }

    await this.stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: false,
    });
  }

  public override async changeSubscription(input: {
    billingInterval: BillingInterval;
    planKey: BillingPlanKey;
    providerSubscriptionId: string;
    timing: "immediate" | "period_end";
  }): Promise<void> {
    const subscription = await this.stripe.subscriptions.retrieve(
      input.providerSubscriptionId,
    );
    const item = subscription.items.data.at(0);

    if (!item) {
      throw new Error("Stripe subscription is missing its subscription item.");
    }

    const priceId = getStripePriceId(input.planKey, input.billingInterval);

    if (input.timing === "immediate") {
      if (subscription.schedule) {
        const scheduleId =
          typeof subscription.schedule === "string"
            ? subscription.schedule
            : subscription.schedule.id;

        await this.stripe.subscriptionSchedules.release(scheduleId);
      }

      await this.stripe.subscriptions.update(subscription.id, {
        items: [{ id: item.id, price: priceId }],
        payment_behavior: "pending_if_incomplete",
        proration_behavior: "always_invoice",
      });

      return;
    }

    const schedule = await this.getOrCreateSchedule(subscription);
    const currentPhase = this.getCurrentPhase(schedule);

    if (!currentPhase) {
      throw new Error("Stripe subscription schedule has no current phase.");
    }

    await this.stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: "release",
      proration_behavior: "none",
      phases: [
        this.toSchedulePhase(currentPhase),
        {
          items: [{ price: priceId, quantity: 1 }],
          proration_behavior: "none",
          start_date: currentPhase.end_date,
        },
      ],
    });
  }

  public override async getSubscriptionSnapshot(input: {
    providerSubscriptionId: string;
  }): Promise<BillingSubscriptionSnapshot> {
    const subscription = await this.stripe.subscriptions.retrieve(
      input.providerSubscriptionId,
    );
    const item = subscription.items.data.at(0);

    if (!item) {
      throw new Error("Stripe subscription is missing its subscription item.");
    }

    const price = getBillingPrice(item.price.id);

    if (!price) {
      throw new Error(
        "Stripe subscription uses an unconfigured Stripe Price ID.",
      );
    }

    const providerCustomerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id;

    const schedule = await this.getSchedule(subscription);
    const scheduledPrice = this.getScheduledPrice(schedule);

    const cancelAt = subscription.cancel_at
      ? new Date(subscription.cancel_at * 1_000)
      : null;

    return {
      billingInterval: price.billingInterval,
      cancelAtPeriodEnd:
        subscription.cancel_at_period_end ||
        cancelAt !== null ||
        schedule?.end_behavior === "cancel",
      currentPeriodEnd: cancelAt ?? new Date(item.current_period_end * 1_000),
      currentPeriodStart: new Date(item.current_period_start * 1_000),
      endedAt: subscription.ended_at
        ? new Date(subscription.ended_at * 1_000)
        : null,
      localUserId: this.getLocalUserId(subscription.metadata["localUserId"]),
      planKey: price.planKey,
      provider: "stripe",
      providerCustomerId,
      providerPriceId: item.price.id,
      providerSubscriptionId: subscription.id,
      scheduledBillingInterval: scheduledPrice?.billingInterval ?? null,
      scheduledPlanKey: scheduledPrice?.planKey ?? null,
      status: this.getSubscriptionStatus(subscription.status),
    };
  }

  public override async listSubscriptionIds(): Promise<string[]> {
    const subscriptionIds: string[] = [];

    for await (const subscription of this.stripe.subscriptions.list({
      limit: 100,
      status: "all",
    })) {
      if (this.getLocalUserId(subscription.metadata["localUserId"])) {
        subscriptionIds.push(subscription.id);
      }
    }

    return subscriptionIds;
  }

  public override async verifyWebhook(input: {
    payload: string;
    signature: string;
  }): Promise<{
    invoiceBillingReason: string | null;
    payload: unknown;
    providerCheckoutSessionId: string | null;
    providerEventId: string;
    providerSubscriptionId: string | null;
    type: string;
  }> {
    const event = await this.stripe.webhooks.constructEventAsync(
      input.payload,
      input.signature,
      this.props.webhookSecret,
    );

    return {
      invoiceBillingReason: this.getInvoiceBillingReason(event.data.object),
      payload: event.data.object,
      providerCheckoutSessionId: this.getCheckoutSessionId(event.data.object),
      providerEventId: event.id,
      providerSubscriptionId: this.getSubscriptionId(event.data.object),
      type: event.type,
    };
  }

  private getSubscriptionStatus(status: string): BillingSubscriptionStatus {
    if (
      status === "active" ||
      status === "canceled" ||
      status === "incomplete" ||
      status === "incomplete_expired" ||
      status === "past_due" ||
      status === "paused" ||
      status === "trialing" ||
      status === "unpaid"
    ) {
      return status;
    }

    throw new Error(`Unsupported Stripe subscription status: ${status}.`);
  }

  private getLocalUserId(value: string | undefined): string | null {
    return value || null;
  }

  private async getOrCreateSchedule(subscription: Stripe.Subscription) {
    const schedule = await this.getSchedule(subscription);

    if (schedule) return schedule;

    return await this.stripe.subscriptionSchedules.create({
      from_subscription: subscription.id,
    });
  }

  private async getSchedule(
    subscription: Stripe.Subscription,
  ): Promise<Stripe.SubscriptionSchedule | null> {
    if (typeof subscription.schedule === "string") {
      return await this.stripe.subscriptionSchedules.retrieve(
        subscription.schedule,
      );
    }

    return subscription.schedule;
  }

  private getCurrentPhase(schedule: Stripe.SubscriptionSchedule) {
    const currentPhaseStartDate = schedule.current_phase?.start_date;

    if (currentPhaseStartDate !== undefined) {
      const currentPhase = schedule.phases.find(
        (phase) => phase.start_date === currentPhaseStartDate,
      );

      if (currentPhase) return currentPhase;
    }

    return schedule.phases.at(0);
  }

  private getScheduledPrice(schedule: Stripe.SubscriptionSchedule | null) {
    if (!schedule) {
      return null;
    }

    const currentPhase = this.getCurrentPhase(schedule);

    if (!currentPhase) {
      return null;
    }

    const scheduledPhase = schedule.phases.find(
      (phase) => phase.start_date === currentPhase.end_date,
    );
    const scheduledItem = scheduledPhase?.items.at(0);

    if (!scheduledItem) {
      return null;
    }

    const scheduledPriceId =
      typeof scheduledItem.price === "string"
        ? scheduledItem.price
        : scheduledItem.price.id;

    return getBillingPrice(scheduledPriceId);
  }

  private toSchedulePhase(
    phase: Stripe.SubscriptionSchedule.Phase,
  ): Stripe.SubscriptionScheduleUpdateParams.Phase {
    return {
      end_date: phase.end_date,
      items: phase.items.map((item) => ({
        price: typeof item.price === "string" ? item.price : item.price.id,
        quantity: item.quantity ?? 1,
      })),
      proration_behavior: "none",
      start_date: phase.start_date,
    };
  }

  private getSubscriptionId(object: unknown): string | null {
    if (
      typeof object === "object" &&
      object !== null &&
      "subscription" in object &&
      typeof object.subscription === "string"
    ) {
      return object.subscription;
    }

    if (
      typeof object === "object" &&
      object !== null &&
      "object" in object &&
      object.object === "subscription" &&
      "id" in object &&
      typeof object.id === "string"
    ) {
      return object.id;
    }

    return null;
  }

  private getInvoiceBillingReason(object: unknown): string | null {
    if (
      typeof object === "object" &&
      object !== null &&
      "object" in object &&
      object.object === "invoice" &&
      "billing_reason" in object &&
      typeof object.billing_reason === "string"
    ) {
      return object.billing_reason;
    }

    return null;
  }

  private getCheckoutSessionId(object: unknown): string | null {
    if (
      typeof object === "object" &&
      object !== null &&
      "object" in object &&
      object.object === "checkout.session" &&
      "id" in object &&
      typeof object.id === "string"
    ) {
      return object.id;
    }

    return null;
  }
}

import type { BillingInterval, BillingPlanKey } from "@repo/constants/billing";

export type BillingProvider = "stripe";
export type BillingSubscriptionStatus =
  | "active"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "past_due"
  | "paused"
  | "trialing"
  | "unpaid";

export interface BillingSubscriptionSnapshot {
  billingInterval: BillingInterval;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  currentPeriodStart: Date | null;
  endedAt: Date | null;
  localUserId: string | null;
  planKey: BillingPlanKey;
  provider: BillingProvider;
  providerCustomerId: string;
  providerPriceId: string;
  providerSubscriptionId: string;
  scheduledBillingInterval: BillingInterval | null;
  scheduledPlanKey: BillingPlanKey | null;
  status: BillingSubscriptionStatus;
}

export abstract class BaseBilling {
  public abstract readonly provider: BillingProvider;

  public abstract createCustomer(input: {
    email: string;
    userId: string;
  }): Promise<{ providerCustomerId: string }>;

  public abstract createCheckoutSession(input: {
    billingInterval: BillingInterval;
    customerId: string;
    idempotencyKey: string;
    planKey: BillingPlanKey;
    userId: string;
  }): Promise<{
    expiresAt: Date;
    providerCheckoutSessionId: string;
    url: string;
  }>;

  public abstract getCheckoutSession(input: {
    providerCheckoutSessionId: string;
  }): Promise<{ url: string | null }>;

  public abstract createPortalSession(input: {
    providerCustomerId: string;
  }): Promise<{ url: string }>;

  public abstract cancelSubscription(input: {
    providerSubscriptionId: string;
  }): Promise<void>;

  public abstract cancelSubscriptionImmediately(input: {
    providerSubscriptionId: string;
  }): Promise<void>;

  public abstract updateCustomerEmail(input: {
    email: string;
    providerCustomerId: string;
  }): Promise<void>;

  public abstract resumeSubscription(input: {
    providerSubscriptionId: string;
  }): Promise<void>;

  public abstract changeSubscription(input: {
    billingInterval: BillingInterval;
    planKey: BillingPlanKey;
    providerSubscriptionId: string;
    timing: "immediate" | "period_end";
  }): Promise<void>;

  public abstract getSubscriptionSnapshot(input: {
    providerSubscriptionId: string;
  }): Promise<BillingSubscriptionSnapshot>;

  public abstract listSubscriptionIds(): Promise<string[]>;

  public abstract verifyWebhook(input: {
    payload: string;
    signature: string;
  }): Promise<{
    invoiceBillingReason: string | null;
    payload: unknown;
    providerCheckoutSessionId: string | null;
    providerEventId: string;
    providerSubscriptionId: string | null;
    type: string;
  }>;
}

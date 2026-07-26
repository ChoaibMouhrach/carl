import { BaseBilling } from "@server/lib/base-billing";

export class DisabledBilling extends BaseBilling {
  public override readonly provider = "stripe";

  public override createCustomer(): Promise<never> {
    return this.unavailable();
  }

  public override createCheckoutSession(): Promise<never> {
    return this.unavailable();
  }

  public override getCheckoutSession(): Promise<never> {
    return this.unavailable();
  }

  public override createPortalSession(): Promise<never> {
    return this.unavailable();
  }

  public override cancelSubscription(): Promise<never> {
    return this.unavailable();
  }

  public override cancelSubscriptionImmediately(): Promise<never> {
    return this.unavailable();
  }

  public override updateCustomerEmail(): Promise<never> {
    return this.unavailable();
  }

  public override resumeSubscription(): Promise<never> {
    return this.unavailable();
  }

  public override changeSubscription(): Promise<never> {
    return this.unavailable();
  }

  public override getSubscriptionSnapshot(): Promise<never> {
    return this.unavailable();
  }

  public override listSubscriptionIds(): Promise<never> {
    return this.unavailable();
  }

  public override verifyWebhook(): Promise<never> {
    return this.unavailable();
  }

  private unavailable(): Promise<never> {
    return Promise.reject(new Error("Stripe billing is not configured."));
  }
}

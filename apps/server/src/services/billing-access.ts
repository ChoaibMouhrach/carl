import { BILLING_PAST_DUE_GRACE_PERIOD_MS } from "@server/config/constants";
import { BaseService } from "@server/lib/base-service";

export class BillingAccessService extends BaseService {
  public async check(input: { userId: string }) {
    const subscription =
      await this.context.repositories.billing.findCurrentSubscription({
        userId: input.userId,
      });

    if (!subscription) {
      return { access: false, reason: "no_subscription" };
    }

    if (
      subscription.status === "active" ||
      subscription.status === "trialing"
    ) {
      return { access: true, reason: subscription.status };
    }

    if (
      subscription.status === "canceled" &&
      subscription.cancelAtPeriodEnd &&
      subscription.currentPeriodEnd &&
      subscription.currentPeriodEnd > new Date()
    ) {
      return { access: true, reason: "canceling" };
    }

    if (subscription.status === "past_due" && subscription.pastDueAt) {
      const graceEndsAt = new Date(
        subscription.pastDueAt.getTime() + BILLING_PAST_DUE_GRACE_PERIOD_MS,
      );

      return {
        access: graceEndsAt > new Date(),
        graceEndsAt,
        reason: "past_due",
      };
    }

    return { access: false, reason: subscription.status };
  }
}

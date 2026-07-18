import type { BillingInterval, BillingPlanKey } from "@repo/constants/billing";
import { BaseApi } from "@/lib/base-api";
import { http } from "@/lib/http";

export class BillingApi extends BaseApi {
  public access() {
    return this.call(() => http.api.billing.access.$get());
  }

  public checkout(input: {
    billingInterval: BillingInterval;
    planKey: BillingPlanKey;
  }) {
    return this.call(() => http.api.billing.checkout.$post({ json: input }));
  }

  public portal() {
    return this.call(() => http.api.billing.portal.$post());
  }

  public cancel() {
    return this.call(() => http.api.billing.cancel.$post());
  }

  public resume() {
    return this.call(() => http.api.billing.resume.$post());
  }

  public change(input: {
    billingInterval: BillingInterval;
    planKey: BillingPlanKey;
  }) {
    return this.call(() => http.api.billing.change.$post({ json: input }));
  }
}

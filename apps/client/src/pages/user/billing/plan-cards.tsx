import {
  billingPlans,
  getBillingPlan,
  isBillingPlanKey,
  type BillingInterval,
  type BillingPlanKey,
} from "@repo/constants/billing";
import { Pricing } from "@repo/ui/components/pricing";
import { Button } from "@repo/ui/components/ui/button";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { cn } from "@repo/ui/utils";
import { useTranslation } from "react-i18next";

interface Subscription {
  billingInterval: string;
  cancelAtPeriodEnd: boolean;
  planKey: string;
  scheduledBillingInterval: string | null;
  scheduledPlanKey: string | null;
}

interface PlanCardsProps {
  isAnyMutating: boolean;
  isChangePending: boolean;
  isCheckoutPending: boolean;
  onChange: (input: {
    billingInterval: BillingInterval;
    planKey: BillingPlanKey;
  }) => void;
  onCheckout: (input: {
    billingInterval: BillingInterval;
    planKey: BillingPlanKey;
  }) => void;
  pendingPlanKey: BillingPlanKey | null;
  subscription: Subscription | null;
}

export const PlanCards = ({
  isAnyMutating,
  isChangePending,
  isCheckoutPending,
  onChange,
  onCheckout,
  pendingPlanKey,
  subscription,
}: PlanCardsProps) => {
  const { t } = useTranslation();

  const getPlanAction = (
    billingInterval: BillingInterval,
    planKey: BillingPlanKey,
  ): string => {
    if (!subscription) {
      return t("billing.plans.choose", {
        plan: billingPlans.find((plan) => plan.key === planKey)?.name,
      });
    }

    const currentPlanKey = isBillingPlanKey(subscription.planKey)
      ? subscription.planKey
      : null;
    const currentPlan = currentPlanKey ? getBillingPlan(currentPlanKey) : null;
    const targetPlan = getBillingPlan(planKey);

    if (!currentPlan || !targetPlan) return t("billing.plans.switchPlan");
    if (targetPlan.order > currentPlan.order) {
      return t("billing.plans.upgradeTo", { plan: targetPlan.name });
    }
    if (targetPlan.order < currentPlan.order) {
      return t("billing.plans.downgradeTo", { plan: targetPlan.name });
    }

    return billingInterval === "yearly"
      ? t("billing.plans.switchToYearly")
      : t("billing.plans.switchToMonthly");
  };

  const getChangeTiming = (
    planKey: BillingPlanKey,
  ): "immediate" | "period_end" | null => {
    if (!subscription) return null;

    const currentPlanKey = isBillingPlanKey(subscription.planKey)
      ? subscription.planKey
      : null;
    const currentPlan = currentPlanKey ? getBillingPlan(currentPlanKey) : null;
    const targetPlan = getBillingPlan(planKey);

    if (!currentPlan || !targetPlan || targetPlan.order === currentPlan.order) {
      return null;
    }

    return targetPlan.order > currentPlan.order ? "immediate" : "period_end";
  };

  return (
    <Pricing
      className="py-4"
      plans={billingPlans}
      renderAction={({ billingInterval, featured, plan }) => {
        const isCurrent =
          subscription?.planKey === plan.key &&
          subscription.billingInterval === billingInterval;
        const isScheduled =
          subscription?.scheduledPlanKey === plan.key &&
          subscription.scheduledBillingInterval === billingInterval;
        const timing = getChangeTiming(plan.key);
        const isThisPlanPending =
          pendingPlanKey === plan.key && (isCheckoutPending || isChangePending);

        return (
          <div className="space-y-1">
            <Button
              className={cn(
                "w-full",
                featured &&
                  "bg-background text-foreground hover:bg-background/90",
              )}
              disabled={isCurrent || isScheduled || isAnyMutating}
              onClick={() => {
                if (subscription) {
                  onChange({ billingInterval, planKey: plan.key });
                } else {
                  onCheckout({ billingInterval, planKey: plan.key });
                }
              }}
              variant={featured ? "default" : "outline"}
            >
              {isThisPlanPending && <Spinner />}
              {isCurrent
                ? t("billing.plans.current")
                : isScheduled
                  ? t("billing.plans.scheduled")
                  : getPlanAction(billingInterval, plan.key)}
            </Button>
            {timing && !isCurrent && !isScheduled && (
              <p
                className={cn(
                  "text-xs",
                  featured ? "text-background/70" : "text-muted-foreground",
                )}
              >
                {timing === "immediate"
                  ? t("billing.plans.immediate")
                  : t("billing.plans.periodEnd")}
              </p>
            )}
          </div>
        );
      }}
    />
  );
};

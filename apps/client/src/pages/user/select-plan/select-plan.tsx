import { api } from "@/api";
import { onError } from "@/lib/base-api";
import { Spinner } from "@repo/ui/components/ui/spinner";
import { PlanCards } from "../billing/plan-cards";
import type { BillingInterval, BillingPlanKey } from "@repo/constants/billing";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const SelectPlan = () => {
  const navigate = useNavigate();

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api.auth.me(),
    refetchInterval: 3_000,
  });

  const checkout = useMutation({
    mutationFn: (input: {
      billingInterval: BillingInterval;
      planKey: BillingPlanKey;
    }) => api.billing.checkout(input),
    onError,
    onSuccess: ({ url }) => window.location.assign(url),
  });

  useEffect(() => {
    if (me.data && !me.data.needsOnboarding) {
      void navigate({ to: "/user/dashboard" });
    }
  }, [me.data, navigate]);

  if (me.isPending) return <Spinner />;
  if (me.isError) throw me.error;

  return (
    <div className="w-full">
      <PlanCards
        isAnyMutating={checkout.isPending}
        isChangePending={false}
        isCheckoutPending={checkout.isPending}
        onChange={() => {}}
        onCheckout={(input) => checkout.mutate(input)}
        pendingPlanKey={checkout.variables?.planKey ?? null}
        subscription={null}
      />
    </div>
  );
};

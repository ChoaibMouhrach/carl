"use client";

import { useTranslations } from "next-intl";
import { billingPlans } from "@repo/constants/billing";
import { Pricing as PricingSection } from "@repo/ui/components/pricing";
import { Button } from "@repo/ui/components/ui/button";
import { cn } from "@repo/ui/utils";

interface PricingProps {
  appUrl: string;
}

export const Pricing = ({ appUrl }: PricingProps) => {
  const t = useTranslations("pricing");

  return (
    <PricingSection
      className="mx-auto max-w-6xl px-6 py-24"
      description={t("description")}
      id="pricing"
      plans={billingPlans}
      renderAction={({ featured }) => (
        <Button
          asChild
          className={cn(
            "w-full",
            featured && "bg-background text-foreground hover:bg-background/90",
          )}
          variant={featured ? "default" : "outline"}
        >
          <a href={appUrl}>{t("getStarted")}</a>
        </Button>
      )}
      title={t("title")}
    />
  );
};

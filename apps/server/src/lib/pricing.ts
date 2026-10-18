import type { CommunityPrice } from "@server/infrastructure/database/schemas";

export const derivePricing = (
  prices: CommunityPrice[],
  memberCount: number,
) => {
  const primary = prices[0] ?? {
    type: "free",
    interval: null,
    amount: 0,
    currency: null,
  };

  const monthly = prices.find(
    (price) => price.type === "paid" && price.interval === "month",
  );
  const yearly = prices.find(
    (price) => price.type === "paid" && price.interval === "year",
  );
  const monthlyCents = monthly?.amount ?? (yearly ? yearly.amount / 12 : null);
  const monthlyPriceUsd = monthlyCents === null ? null : monthlyCents / 100;

  return {
    prices,
    pricingType: primary.type,
    pricingInterval: primary.interval,
    priceAmount: primary.amount,
    priceCurrency: primary.currency,
    monthlyPriceUsd,
    estMonthlyRevenue:
      monthlyPriceUsd === null ? null : monthlyPriceUsd * memberCount,
  };
};

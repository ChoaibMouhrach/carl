import type { SkoolDiscoveryGroup } from "./base-skool-scraper";
import type { CommunityPrice } from "@server/infrastructure/database/schemas";

export const freePrices = (): CommunityPrice[] => [
  { type: "free", interval: null, amount: 0, currency: null },
];

// displayPrice is the headline price; the legacy monthly/annual plan prices carry no interval of their own
export const paidPrices = (group: SkoolDiscoveryGroup): CommunityPrice[] => {
  const candidates = [
    group.displayPrice && {
      ...group.displayPrice,
      interval: group.displayPrice.interval ?? "one_time",
    },
    group.monthlyPrice && { ...group.monthlyPrice, interval: "month" as const },
    group.annualPrice && { ...group.annualPrice, interval: "year" as const },
  ];

  const prices: CommunityPrice[] = [];

  for (const candidate of candidates) {
    if (!candidate || candidate.interval === null) continue;

    const isDuplicate = prices.some(
      (price) =>
        price.interval === candidate.interval &&
        price.amount === candidate.amount,
    );

    if (!isDuplicate) {
      prices.push({
        type: "paid",
        interval: candidate.interval,
        amount: candidate.amount,
        currency: candidate.currency.toUpperCase(),
      });
    }
  }

  return prices;
};

// Listings of private communities hide their price, so a paid search match without one has an unknown amount
export const unknownPaidPrices = (): CommunityPrice[] => [
  { type: "paid", interval: null, amount: 0, currency: null },
];

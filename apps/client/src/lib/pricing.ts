import { formatCurrency } from "@/lib/format";

export type PriceInterval = "month" | "year" | "one_time";

export const intervalLabels: Record<PriceInterval, string> = {
  month: "per month",
  year: "per year",
  one_time: "one-time",
};

export const intervalOptions: { value: PriceInterval; label: string }[] = [
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
  { value: "one_time", label: "One-time" },
];

export interface PricedCommunity {
  isFree: boolean;
  priceCents: number | null;
  priceCurrency: string | null;
  priceInterval: PriceInterval | null;
}

export const formatPrice = (community: PricedCommunity) => {
  if (community.isFree) return "Free";
  if (community.priceCents === null) return "—";

  const amount = formatCurrency(
    community.priceCents / 100,
    community.priceCurrency ?? "USD",
  );

  return community.priceInterval
    ? `${amount} ${intervalLabels[community.priceInterval]}`
    : amount;
};

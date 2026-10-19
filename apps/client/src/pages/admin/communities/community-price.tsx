import { formatCurrency } from "@/lib/format";
import { Badge } from "@repo/ui/components/ui/badge";

const intervalLabels = {
  month: "/ month",
  year: "/ year",
  one_time: "one-time",
} as const;

interface CommunityPriceProps {
  community: {
    pricingType: "free" | "paid";
    priceAmount: number;
    priceCurrency: string | null;
    pricingInterval: keyof typeof intervalLabels | null;
  };
}

export const CommunityPrice = ({ community }: CommunityPriceProps) => {
  if (community.pricingType === "free") {
    return <Badge variant="secondary">Free</Badge>;
  }

  return (
    <>
      {formatCurrency(
        community.priceAmount / 100,
        community.priceCurrency ?? "USD",
      )}{" "}
      {community.pricingInterval && intervalLabels[community.pricingInterval]}
    </>
  );
};

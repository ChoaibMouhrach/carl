import type { UpdateCommunityInput } from "@/api/community";
import type {
  CommunityFormValues,
  CommunityPriceValue,
} from "@/pages/admin/communities/community-form";

interface ExistingPrice {
  type: "free" | "paid";
  interval: "month" | "year" | "one_time" | null;
  amount: number;
  currency: string | null;
}

const toPriceValue = (price: ExistingPrice): CommunityPriceValue[] => {
  if (price.type === "free") return [{ type: "free" }];

  if (price.interval && price.currency) {
    return [
      {
        type: "paid",
        interval: price.interval,
        amount: price.amount,
        currency: price.currency,
      },
    ];
  }

  return [];
};

export const toCommunityUpdate = (
  values: CommunityFormValues,
  existingPrices: ExistingPrice[],
): UpdateCommunityInput => ({
  leadId: values.leadId,
  name: values.name,
  displayName: values.displayName,
  communityUrl: values.communityUrl,
  description: values.description,
  memberCount: values.memberCount,
  prices: [values.price, ...existingPrices.slice(1).flatMap(toPriceValue)],
});

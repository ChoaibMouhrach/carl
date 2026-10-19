import type {
  SkoolDiscoveryGroup,
  SkoolPriceFilter,
  SkoolVisibility,
} from "./base-skool-scraper";
import type { CommunityPrice } from "@server/infrastructure/database/schemas";
import { freePrices, paidPrices, unknownPaidPrices } from "./skool-prices";

export interface DiscoveryCriteria {
  visibility: SkoolVisibility;
  price: SkoolPriceFilter;
}

/** Every type paired with every pricing model */
export const buildSearches = (
  types: readonly SkoolVisibility[],
  pricingModels: readonly SkoolPriceFilter[],
): DiscoveryCriteria[] =>
  types.flatMap((visibility) =>
    pricingModels.map((price) => ({ visibility, price })),
  );

export interface DiscoveredCommunity {
  skoolId: string;
  name: string;
  keyword: string;
  search: string;
  accessType: SkoolVisibility;
  freeTrialEnabled: boolean;
  prices: CommunityPrice[];
  group: SkoolDiscoveryGroup;
}

export const searchName = (criteria: DiscoveryCriteria) =>
  `${criteria.visibility}-${criteria.price}`;

export const classifyGroup = (
  criteria: DiscoveryCriteria,
  group: SkoolDiscoveryGroup,
  keyword: string,
): DiscoveredCommunity => {
  const listedPrices = paidPrices(group);

  return {
    skoolId: group.skoolId,
    name: group.name,
    keyword,
    search: searchName(criteria),
    accessType: criteria.visibility,
    freeTrialEnabled: criteria.price === "free-trial",
    prices:
      criteria.price === "free"
        ? freePrices()
        : listedPrices.length > 0
          ? listedPrices
          : unknownPaidPrices(),
    group,
  };
};

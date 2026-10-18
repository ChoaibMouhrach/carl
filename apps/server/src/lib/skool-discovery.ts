import type {
  SkoolDiscoveryGroup,
  SkoolVisibility,
} from "./base-skool-scraper";
import type {
  CampaignSearch,
  CommunityPrice,
} from "@server/infrastructure/database/schemas";
import { freePrices, paidPrices, unknownPaidPrices } from "./skool-prices";

export type DiscoveryCriteria = CampaignSearch;

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

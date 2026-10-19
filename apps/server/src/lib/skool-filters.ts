export interface CommunityFilters {
  minMonthlyPriceUsd?: number | null;
  maxMonthlyPriceUsd?: number | null;
  minMembers?: number | null;
  maxMembers?: number | null;
}

interface CommunityFacts {
  pricingType: string;
  monthlyPriceUsd: number | null;
  memberCount: number;
}

const within = (value: number, min?: number | null, max?: number | null) =>
  (min == null || value >= min) && (max == null || value <= max);

export const matchesFilters = (
  filters: CommunityFilters,
  community: CommunityFacts,
) => {
  if (!within(community.memberCount, filters.minMembers, filters.maxMembers)) {
    return false;
  }

  const hasPriceBound =
    filters.minMonthlyPriceUsd != null || filters.maxMonthlyPriceUsd != null;

  if (!hasPriceBound) return true;

  if (community.pricingType === "free") {
    return within(0, filters.minMonthlyPriceUsd, filters.maxMonthlyPriceUsd);
  }

  // One-time and unknown prices have no monthly equivalent to compare
  return (
    community.monthlyPriceUsd !== null &&
    within(
      community.monthlyPriceUsd,
      filters.minMonthlyPriceUsd,
      filters.maxMonthlyPriceUsd,
    )
  );
};

import { CampaignFilter } from "@/components/campaign-filter";
import type { CampaignOption } from "@/hooks/use-campaign-options";
import { FilterSelect } from "@/components/filter-select";
import { Search } from "@/components/search";
import { communitySortOptions } from "@/lib/sort-options";
import {
  CommunityFiltersSheet,
  type CommunityRangeFilters,
} from "./community-filters-sheet";

type PricingFilter = "any" | "free" | "paid";

const pricingOptions: { value: PricingFilter; label: string }[] = [
  { value: "any", label: "Free and paid" },
  { value: "paid", label: "Paid only" },
  { value: "free", label: "Free only" },
];

interface CommunityFiltersProps {
  campaignId?: number;
  campaigns: CampaignOption[];
  onCampaignChange: (campaignId: number | undefined) => void;
  createAction: React.ReactNode;
  isFree?: boolean;
  onApplyRanges: (filters: CommunityRangeFilters) => void;
  onIsFreeChange: (isFree: boolean | undefined) => void;
  onSearch: (search: string | undefined) => void;
  onSortChange: (value: string) => void;
  rangeFilters: CommunityRangeFilters;
  search?: string;
  sort: string;
  viewSwitch: React.ReactNode;
}

export const CommunityFilters = ({
  campaignId,
  campaigns,
  onCampaignChange,
  createAction,
  isFree,
  onApplyRanges,
  onIsFreeChange,
  onSearch,
  onSortChange,
  rangeFilters,
  search,
  sort,
  viewSwitch,
}: CommunityFiltersProps) => {
  const pricing: PricingFilter =
    isFree === undefined ? "any" : isFree ? "free" : "paid";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Search
        id="community-search"
        onSearch={onSearch}
        placeholder="Search name, link, email or description"
        value={search}
      />
      <FilterSelect
        label="Pricing"
        onChange={(value) =>
          onIsFreeChange(value === "any" ? undefined : value === "free")
        }
        options={pricingOptions}
        value={pricing}
      />
      <CampaignFilter
        campaignId={campaignId}
        campaigns={campaigns}
        onChange={onCampaignChange}
      />
      <FilterSelect
        label="Sort by"
        onChange={onSortChange}
        options={communitySortOptions}
        value={sort}
      />
      <CommunityFiltersSheet filters={rangeFilters} onApply={onApplyRanges} />
      <div className="ml-auto flex items-center gap-2">
        {viewSwitch}
        {createAction}
      </div>
    </div>
  );
};

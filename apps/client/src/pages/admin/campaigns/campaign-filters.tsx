import { FilterSelect } from "@/components/filter-select";
import { Search } from "@/components/search";
import { campaignSortOptions } from "@/lib/sort-options";

interface CampaignFiltersProps {
  createAction: React.ReactNode;
  onSearch: (search: string | undefined) => void;
  onSortChange: (value: string) => void;
  search?: string;
  sort: string;
}

export const CampaignFilters = ({
  createAction,
  onSearch,
  onSortChange,
  search,
  sort,
}: CampaignFiltersProps) => (
  <div className="flex flex-wrap items-center gap-2">
    <Search
      id="campaign-search"
      onSearch={onSearch}
      placeholder="Search name, description or keyword"
      value={search}
    />
    <FilterSelect
      label="Sort by"
      onChange={onSortChange}
      options={campaignSortOptions}
      value={sort}
    />
    <div className="ml-auto">{createAction}</div>
  </div>
);

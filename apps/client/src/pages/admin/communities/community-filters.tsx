import { Search } from "@/components/search";
import {
  CommunityFiltersSheet,
  type CommunityFilterValues,
} from "./community-filters-sheet";

interface CommunityFiltersProps {
  createAction: React.ReactNode;
  exportAction: React.ReactNode;
  viewSwitch: React.ReactNode;
  filters: CommunityFilterValues;
  onApplyFilters: (filters: CommunityFilterValues) => void;
  onSearch: (search: string | undefined) => void;
  search?: string;
}

export const CommunityFilters = ({
  createAction,
  exportAction,
  viewSwitch,
  filters,
  onApplyFilters,
  onSearch,
  search,
}: CommunityFiltersProps) => {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Search
        id="community-search"
        onSearch={onSearch}
        placeholder="Search by name"
        value={search}
      />
      <CommunityFiltersSheet filters={filters} onApply={onApplyFilters} />
      <div className="ml-auto flex items-center gap-2">
        {viewSwitch}
        {exportAction}
        {createAction}
      </div>
    </div>
  );
};

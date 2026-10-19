import { Search } from "@/components/search";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";

type SortBy = "createdAt" | "name" | "communityCount";
type SortOrder = "asc" | "desc";

interface LeadFiltersProps {
  createAction: React.ReactNode;
  exportAction: React.ReactNode;
  viewSwitch: React.ReactNode;
  hasWebsite?: boolean;
  onHasWebsiteChange: (hasWebsite: boolean | undefined) => void;
  onSearch: (search: string | undefined) => void;
  onSortByChange: (sortBy: SortBy) => void;
  onSortOrderChange: (sortOrder: SortOrder) => void;
  search?: string;
  sortBy: SortBy;
  sortOrder: SortOrder;
}

export const LeadFilters = ({
  createAction,
  exportAction,
  viewSwitch,
  hasWebsite,
  onHasWebsiteChange,
  onSearch,
  onSortByChange,
  onSortOrderChange,
  search,
  sortBy,
  sortOrder,
}: LeadFiltersProps) => {
  const websiteItems = [
    { value: "all", label: "Any website" },
    { value: "true", label: "Has website" },
    { value: "false", label: "No website" },
  ];

  const sortByItems: { value: SortBy; label: string }[] = [
    { value: "createdAt", label: "Date added" },
    { value: "name", label: "Name" },
    { value: "communityCount", label: "Communities" },
  ];

  const sortOrderItems: { value: SortOrder; label: string }[] = [
    { value: "desc", label: "Descending" },
    { value: "asc", label: "Ascending" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Search
        onSearch={onSearch}
        placeholder="Search by name or username"
        value={search}
      />
      <Select
        items={websiteItems}
        onValueChange={(value) =>
          onHasWebsiteChange(
            value === "true" ? true : value === "false" ? false : undefined,
          )
        }
        value={hasWebsite === undefined ? "all" : String(hasWebsite)}
      >
        <SelectTrigger aria-label="Website">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Website</SelectLabel>
            {websiteItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select
        items={sortByItems}
        onValueChange={(value) => {
          const item = sortByItems.find((option) => option.value === value);
          if (item) onSortByChange(item.value);
        }}
        value={sortBy}
      >
        <SelectTrigger aria-label="Sort by">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Sort by</SelectLabel>
            {sortByItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select
        items={sortOrderItems}
        onValueChange={(value) => {
          const item = sortOrderItems.find((option) => option.value === value);
          if (item) onSortOrderChange(item.value);
        }}
        value={sortOrder}
      >
        <SelectTrigger aria-label="Order">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Order</SelectLabel>
            {sortOrderItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <div className="ml-auto flex items-center gap-2">
        {viewSwitch}
        {exportAction}
        {createAction}
      </div>
    </div>
  );
};

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
import { useTranslation } from "react-i18next";

type SortBy = "createdAt" | "name" | "communityCount";
type SortOrder = "asc" | "desc";

interface LeadFiltersProps {
  createAction: React.ReactNode;
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
  hasWebsite,
  onHasWebsiteChange,
  onSearch,
  onSortByChange,
  onSortOrderChange,
  search,
  sortBy,
  sortOrder,
}: LeadFiltersProps) => {
  const { t } = useTranslation();

  const websiteItems = [
    { value: "all", label: t("adminLeads.allWebsites") },
    { value: "true", label: t("adminLeads.withWebsite") },
    { value: "false", label: t("adminLeads.withoutWebsite") },
  ];

  const sortByItems: { value: SortBy; label: string }[] = [
    { value: "createdAt", label: t("adminLeads.sortCreatedAt") },
    { value: "name", label: t("adminLeads.sortName") },
    { value: "communityCount", label: t("adminLeads.sortCommunityCount") },
  ];

  const sortOrderItems: { value: SortOrder; label: string }[] = [
    { value: "desc", label: t("adminLeads.descending") },
    { value: "asc", label: t("adminLeads.ascending") },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Search
        onSearch={onSearch}
        placeholder={t("adminLeads.search")}
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
        <SelectTrigger aria-label={t("adminLeads.websiteFilter")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>{t("adminLeads.websiteFilter")}</SelectLabel>
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
        <SelectTrigger aria-label={t("adminLeads.sortBy")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>{t("adminLeads.sortBy")}</SelectLabel>
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
        <SelectTrigger aria-label={t("adminLeads.sortOrder")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>{t("adminLeads.sortOrder")}</SelectLabel>
            {sortOrderItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <div className="ml-auto">{createAction}</div>
    </div>
  );
};

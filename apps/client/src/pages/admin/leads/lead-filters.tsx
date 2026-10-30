import { CampaignFilter } from "@/components/campaign-filter";
import type { CampaignOption } from "@/hooks/use-campaign-options";
import { FilterSelect } from "@/components/filter-select";
import { Search } from "@/components/search";
import { leadStageOptions } from "@/lib/lead-stage";
import { leadSortOptions } from "@/lib/sort-options";
import type { LeadStage } from "@repo/constants/pipeline";

type EmailFilter = "any" | "with" | "without";

const emailOptions: { value: EmailFilter; label: string }[] = [
  { value: "any", label: "Any email" },
  { value: "with", label: "Has email" },
  { value: "without", label: "No email" },
];

interface LeadFiltersProps {
  campaignId?: number;
  campaigns?: CampaignOption[];
  onCampaignChange?: (campaignId: number | undefined) => void;
  createAction?: React.ReactNode;
  stage?: LeadStage;
  onStageChange: (stage: LeadStage | undefined) => void;
  hasEmail?: boolean;
  onHasEmailChange: (hasEmail: boolean | undefined) => void;
  onSearch: (search: string | undefined) => void;
  onSortChange: (value: string) => void;
  search?: string;
  sort: string;
  viewSwitch?: React.ReactNode;
}

export const LeadFilters = ({
  campaignId,
  campaigns,
  onCampaignChange,
  createAction,
  stage,
  onStageChange,
  hasEmail,
  onHasEmailChange,
  onSearch,
  onSortChange,
  search,
  sort,
  viewSwitch,
}: LeadFiltersProps) => {
  const emailValue: EmailFilter =
    hasEmail === undefined ? "any" : hasEmail ? "with" : "without";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Search
        id="lead-search"
        onSearch={onSearch}
        placeholder="Search name, username, email or link"
        value={search}
      />
      <FilterSelect
        label="Email"
        onChange={(value) =>
          onHasEmailChange(value === "any" ? undefined : value === "with")
        }
        options={emailOptions}
        value={emailValue}
      />
      <FilterSelect
        label="Stage"
        onChange={(value) => onStageChange(value === "any" ? undefined : value)}
        options={leadStageOptions}
        value={stage ?? "any"}
      />
      {campaigns && onCampaignChange && (
        <CampaignFilter
          campaignId={campaignId}
          campaigns={campaigns}
          onChange={onCampaignChange}
        />
      )}
      <FilterSelect
        label="Sort by"
        onChange={onSortChange}
        options={leadSortOptions}
        value={sort}
      />
      <div className="ml-auto flex items-center gap-2">
        {viewSwitch}
        {createAction}
      </div>
    </div>
  );
};

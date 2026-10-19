import { Search } from "@/components/search";
import { campaignStatusLabels } from "@/lib/campaign";
import { campaignStatuses, type CampaignStatus } from "@/lib/campaign";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";

interface CampaignFiltersProps {
  createAction: React.ReactNode;
  exportAction: React.ReactNode;
  viewSwitch: React.ReactNode;
  onSearch: (search: string | undefined) => void;
  onStatusChange: (status: CampaignStatus | undefined) => void;
  search?: string;
  status?: CampaignStatus;
}

export const CampaignFilters = ({
  createAction,
  exportAction,
  viewSwitch,
  onSearch,
  onStatusChange,
  search,
  status,
}: CampaignFiltersProps) => {
  const statusItems = [
    { value: "all", label: "All statuses" },
    ...campaignStatuses.map((value) => ({
      value,
      label: campaignStatusLabels[value],
    })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Search
        onSearch={onSearch}
        placeholder="Search campaigns"
        value={search}
      />
      <Select
        items={statusItems}
        onValueChange={(value) =>
          onStatusChange(campaignStatuses.find((item) => item === value))
        }
        value={status ?? "all"}
      >
        <SelectTrigger aria-label="Status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Status</SelectLabel>
            {statusItems.map((item) => (
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

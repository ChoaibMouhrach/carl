import { Search } from "@/components/search";
import { leadStatusLabels } from "@/lib/campaign";
import { leadStatuses, type LeadStatus } from "@/lib/campaign";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";

interface CampaignLeadFiltersProps {
  exportAction: React.ReactNode;
  viewSwitch: React.ReactNode;
  onSearch: (search: string | undefined) => void;
  onStatusChange: (status: LeadStatus | undefined) => void;
  search?: string;
  status?: LeadStatus;
}

export const CampaignLeadFilters = ({
  exportAction,
  viewSwitch,
  onSearch,
  onStatusChange,
  search,
  status,
}: CampaignLeadFiltersProps) => {
  const statusItems = [
    { value: "all", label: "Any status" },
    ...leadStatuses.map((value) => ({
      value,
      label: leadStatusLabels[value],
    })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Search
        onSearch={onSearch}
        placeholder="Search by lead, username or community"
        value={search}
      />
      <Select
        items={statusItems}
        onValueChange={(value) =>
          onStatusChange(leadStatuses.find((item) => item === value))
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
      </div>
    </div>
  );
};

import { Search } from "@/components/search";
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
import { useTranslation } from "react-i18next";

interface CampaignLeadFiltersProps {
  viewSwitch: React.ReactNode;
  onSearch: (search: string | undefined) => void;
  onStatusChange: (status: LeadStatus | undefined) => void;
  search?: string;
  status?: LeadStatus;
}

export const CampaignLeadFilters = ({
  viewSwitch,
  onSearch,
  onStatusChange,
  search,
  status,
}: CampaignLeadFiltersProps) => {
  const { t } = useTranslation();

  const statusItems = [
    { value: "all", label: t("adminCampaign.anyStatus") },
    ...leadStatuses.map((value) => ({
      value,
      label: t(`adminCampaign.leadStatus.${value}`),
    })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Search
        onSearch={onSearch}
        placeholder={t("adminCampaign.searchLeads")}
        value={search}
      />
      <Select
        items={statusItems}
        onValueChange={(value) =>
          onStatusChange(leadStatuses.find((item) => item === value))
        }
        value={status ?? "all"}
      >
        <SelectTrigger aria-label={t("adminCampaign.statusFilter")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>{t("adminCampaign.statusFilter")}</SelectLabel>
            {statusItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <div className="ml-auto">{viewSwitch}</div>
    </div>
  );
};

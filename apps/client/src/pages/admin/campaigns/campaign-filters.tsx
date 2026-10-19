import { Search } from "@/components/search";
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
import { useTranslation } from "react-i18next";

interface CampaignFiltersProps {
  createAction: React.ReactNode;
  viewSwitch: React.ReactNode;
  onSearch: (search: string | undefined) => void;
  onStatusChange: (status: CampaignStatus | undefined) => void;
  search?: string;
  status?: CampaignStatus;
}

export const CampaignFilters = ({
  createAction,
  viewSwitch,
  onSearch,
  onStatusChange,
  search,
  status,
}: CampaignFiltersProps) => {
  const { t } = useTranslation();

  const statusItems = [
    { value: "all", label: t("adminCampaigns.allStatuses") },
    ...campaignStatuses.map((value) => ({
      value,
      label: t(`adminCampaigns.status.${value}`),
    })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Search
        onSearch={onSearch}
        placeholder={t("adminCampaigns.search")}
        value={search}
      />
      <Select
        items={statusItems}
        onValueChange={(value) =>
          onStatusChange(campaignStatuses.find((item) => item === value))
        }
        value={status ?? "all"}
      >
        <SelectTrigger aria-label={t("adminCampaigns.statusFilter")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>{t("adminCampaigns.statusFilter")}</SelectLabel>
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
        {createAction}
      </div>
    </div>
  );
};

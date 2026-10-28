import { FilterSelect } from "@/components/filter-select";
import type { CampaignOption } from "@/hooks/use-campaign-options";

const anyCampaign = "any";

interface CampaignFilterProps {
  campaignId?: number;
  campaigns: CampaignOption[];
  onChange: (campaignId: number | undefined) => void;
}

export const CampaignFilter = ({
  campaignId,
  campaigns,
  onChange,
}: CampaignFilterProps) => (
  <FilterSelect
    label="Campaign"
    onChange={(value) =>
      onChange(value === anyCampaign ? undefined : Number(value))
    }
    options={[{ value: anyCampaign, label: "Any campaign" }, ...campaigns]}
    value={campaignId === undefined ? anyCampaign : String(campaignId)}
  />
);

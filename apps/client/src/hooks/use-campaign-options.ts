import { api } from "@/api";
import { useQuery } from "@tanstack/react-query";

export interface CampaignOption {
  value: string;
  label: string;
}

// Feeds the campaign filter and the "add to campaign" picker
export const useCampaignOptions = (): CampaignOption[] => {
  const campaigns = useQuery({
    queryKey: ["admin", "campaigns", "options"],
    queryFn: () =>
      api.campaign.list({ perPage: 100, sort: "name", order: "asc" }),
    placeholderData: (previousData) => previousData,
  });

  return (
    campaigns.data?.campaigns.map((campaign) => ({
      value: String(campaign.campaignId),
      label: campaign.name,
    })) ?? []
  );
};

import type { QueryClient } from "@tanstack/react-query";

// Leads and communities show each other's data, so one change refreshes both
export const invalidateLeadData = async (queryClient: QueryClient) => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["admin", "leads"] }),
    queryClient.invalidateQueries({ queryKey: ["admin", "communities"] }),
  ]);
};

// Membership changes show up in the campaign counts and in both filtered lists
export const invalidateCampaignData = async (queryClient: QueryClient) => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["admin", "campaigns"] }),
    invalidateLeadData(queryClient),
  ]);
};

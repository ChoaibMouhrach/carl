import type { QueryClient } from "@tanstack/react-query";

// Leads and communities show each other's data, so one change refreshes both
export const invalidateLeadData = async (queryClient: QueryClient) => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["admin", "leads"] }),
    queryClient.invalidateQueries({ queryKey: ["admin", "communities"] }),
  ]);
};

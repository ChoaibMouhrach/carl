import type { QueryClient } from "@tanstack/react-query";

export const invalidateLeadData = async (queryClient: QueryClient) => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["admin", "leads"] }),
    queryClient.invalidateQueries({ queryKey: ["admin", "communities"] }),
  ]);
};

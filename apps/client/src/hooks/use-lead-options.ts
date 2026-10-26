import { api } from "@/api";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useDebounce } from "use-debounce";

// Feeds the owner picker: the first leads by name, narrowed as the user types
export const useLeadOptions = () => {
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);

  const leads = useQuery({
    queryKey: ["admin", "leads", "options", debouncedSearch],
    queryFn: () =>
      api.lead.list({
        search: debouncedSearch.trim() || undefined,
        sort: "name",
        order: "asc",
      }),
    placeholderData: (previousData) => previousData,
  });

  return { leads: leads.data?.leads ?? [], onSearch: setSearch };
};

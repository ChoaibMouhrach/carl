import { Search } from "@/components/search";
import { Button } from "@repo/ui/components/ui/button";
import { useTranslation } from "react-i18next";

interface ClientFiltersProps {
  onAddClick: () => void;
  onSearch: (search: string | undefined) => void;
  search?: string;
}

export const ClientFilters = ({
  onAddClick,
  onSearch,
  search,
}: ClientFiltersProps) => {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between gap-2">
      <Search
        onSearch={onSearch}
        placeholder={t("clients.search")}
        value={search}
      />
      <Button onClick={onAddClick}>{t("clients.add")}</Button>
    </div>
  );
};

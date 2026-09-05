import { Search } from "@/components/search";
import { Button } from "@repo/ui/components/ui/button";
import { useTranslation } from "react-i18next";

interface FolderFiltersProps {
  onAddClick: () => void;
  onUploadClick?: () => void;
  onSearch: (search: string | undefined) => void;
  search?: string;
}

export const FolderFilters = ({
  onAddClick,
  onUploadClick,
  onSearch,
  search,
}: FolderFiltersProps) => {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between gap-2">
      <Search
        onSearch={onSearch}
        placeholder={t("clientFolders.search")}
        value={search}
      />
      <div className="flex items-center gap-2">
        {onUploadClick && (
          <Button variant="outline" onClick={onUploadClick}>
            {t("clientFolders.upload")}
          </Button>
        )}
        <Button onClick={onAddClick}>{t("clientFolders.add")}</Button>
      </div>
    </div>
  );
};

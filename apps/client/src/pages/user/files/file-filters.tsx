import { Search } from "@/components/search";
import { Button } from "@repo/ui/components/ui/button";
import { useTranslation } from "react-i18next";

interface FileFiltersProps {
  onUploadClick: () => void;
  onSearch: (search: string | undefined) => void;
  search?: string;
}

export const FileFilters = ({
  onUploadClick,
  onSearch,
  search,
}: FileFiltersProps) => {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between gap-2">
      <Search
        onSearch={onSearch}
        placeholder={t("files.search")}
        value={search}
      />
      <Button onClick={onUploadClick}>{t("files.upload")}</Button>
    </div>
  );
};

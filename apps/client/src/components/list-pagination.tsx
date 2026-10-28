import { DataPagination } from "@/components/data-pagination";
import { FilterSelect } from "@/components/filter-select";
import { pageSizes, type PageSize } from "@repo/constants/pagination";

interface ListPaginationProps {
  currentPage: number;
  lastPage: number;
  onPageChange: (page: number) => void;
  onPerPageChange: (perPage: PageSize) => void;
  perPage: PageSize;
}

const options = pageSizes.map((size) => ({
  value: String(size),
  label: `${size} per page`,
}));

export const ListPagination = ({
  currentPage,
  lastPage,
  onPageChange,
  onPerPageChange,
  perPage,
}: ListPaginationProps) => (
  <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
    <FilterSelect
      label="Rows per page"
      onChange={(value) => {
        const size = pageSizes.find((item) => String(item) === value);
        if (size) onPerPageChange(size);
      }}
      options={options}
      value={String(perPage)}
    />
    <DataPagination
      currentPage={currentPage}
      lastPage={lastPage}
      onPageChange={onPageChange}
    />
  </div>
);

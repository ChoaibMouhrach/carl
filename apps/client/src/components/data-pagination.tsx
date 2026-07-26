import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@repo/ui/components/ui/pagination";

interface DataPaginationProps {
  currentPage: number;
  lastPage: number;
  onPageChange: (page: number) => void;
  siblingCount?: number;
}

const DOTS = "dots";

const range = (start: number, end: number): number[] =>
  Array.from({ length: end - start + 1 }, (_, i) => start + i);

const getPaginationRange = (
  currentPage: number,
  lastPage: number,
  siblingCount: number,
): (number | typeof DOTS)[] => {
  const totalPageNumbers = siblingCount * 2 + 5;

  if (totalPageNumbers >= lastPage) {
    return range(1, lastPage);
  }

  const leftSibling = Math.max(currentPage - siblingCount, 1);
  const rightSibling = Math.min(currentPage + siblingCount, lastPage);

  const showLeftDots = leftSibling > 2;
  const showRightDots = rightSibling < lastPage - 1;

  if (!showLeftDots && showRightDots) {
    const leftItemCount = 3 + 2 * siblingCount;
    return [...range(1, leftItemCount), DOTS, lastPage];
  }

  if (showLeftDots && !showRightDots) {
    const rightItemCount = 3 + 2 * siblingCount;
    return [1, DOTS, ...range(lastPage - rightItemCount + 1, lastPage)];
  }

  return [1, DOTS, ...range(leftSibling, rightSibling), DOTS, lastPage];
};

export const DataPagination: React.FC<DataPaginationProps> = ({
  currentPage,
  lastPage,
  siblingCount = 1,
  onPageChange,
}) => {
  const pages = getPaginationRange(currentPage, lastPage, siblingCount);

  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
          />
        </PaginationItem>

        {pages.map((page, index) =>
          page === DOTS ? (
            <PaginationItem key={`dots-${index}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={page}>
              <PaginationLink
                isActive={page === currentPage}
                onClick={() => onPageChange(page)}
              >
                {page}
              </PaginationLink>
            </PaginationItem>
          ),
        )}

        <PaginationItem>
          <PaginationNext
            disabled={currentPage >= lastPage}
            onClick={() => onPageChange(currentPage + 1)}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
};

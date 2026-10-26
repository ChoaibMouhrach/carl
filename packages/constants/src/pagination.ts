export const pageSizes = [10, 20, 50, 100] as const;

export type PageSize = (typeof pageSizes)[number];

export const defaultPageSize: PageSize = 20;

export const isPageSize = (value: number): value is PageSize =>
  pageSizes.some((size) => size === value);

// A bulk action covers at most one full page of the largest size
export const maxBulkIds = 100;

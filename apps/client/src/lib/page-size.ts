import {
  defaultPageSize,
  isPageSize,
  type PageSize,
} from "@repo/constants/pagination";
import z from "zod";

// An unknown size in the URL falls back to the default instead of breaking the page
export const perPageSearchSchema = z.coerce
  .number()
  .refine(isPageSize)
  .optional()
  .catch(undefined);

export const resolvePageSize = (perPage: PageSize | undefined): PageSize =>
  perPage ?? defaultPageSize;

// The default size stays out of the URL to keep links short
export const perPageForUrl = (perPage: PageSize): PageSize | undefined =>
  perPage === defaultPageSize ? undefined : perPage;

import z from "zod";
import { defaultPageSize, isPageSize } from "@repo/constants/pagination";

export const skoolUrlSchema = z.url().refine(
  (value) => {
    const { hostname } = new URL(value);
    return hostname === "skool.com" || hostname.endsWith(".skool.com");
  },
  { message: "Must be a skool.com URL" },
);

export const pageSchema = z.coerce.number().int().positive().default(1);

export const perPageSchema = z.coerce
  .number()
  .int()
  .refine(isPageSize, "Choose 10, 20, 50 or 100 per page")
  .default(defaultPageSize);

export const searchSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

export const orderSchema = z.enum(["asc", "desc"]).default("desc");

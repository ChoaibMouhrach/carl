import z from "zod";
import { maxBulkIds } from "@repo/constants/pagination";
import {
  orderSchema,
  pageSchema,
  perPageSchema,
  searchSchema,
  skoolUrlSchema,
} from "./skool";

const optionalUrl = z.url().nullish();

const leadFields = {
  name: z.string().trim().min(1).max(255),
  username: z.string().trim().min(1).max(255),
  skoolUrl: skoolUrlSchema,
  bio: z.string().nullish(),
  instagram: optionalUrl,
  facebook: optionalUrl,
  linkedin: optionalUrl,
  website: optionalUrl,
  email: z.email().nullish(),
  pictureUrl: optionalUrl,
};

export const leadParamSchema = z.object({
  leadId: z.coerce.number().int().positive(),
});

export const leadListQuerySchema = z.object({
  page: pageSchema,
  perPage: perPageSchema,
  search: searchSchema,
  hasEmail: z.stringbool().optional(),
  sort: z.enum(["name", "username", "createdAt"]).default("createdAt"),
  order: orderSchema,
});

export const leadBulkDeleteSchema = z.object({
  leadIds: z.array(z.number().int().positive()).min(1).max(maxBulkIds),
});

export const leadCreateSchema = z.object(leadFields);

export const leadUpdateSchema = z.object(leadFields).partial();

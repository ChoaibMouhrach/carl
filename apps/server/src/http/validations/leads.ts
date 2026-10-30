import z from "zod";
import { leadStages } from "@repo/constants/pipeline";
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
  emails: z.array(z.email()).max(20).optional(),
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
  campaignId: z.coerce.number().int().positive().optional(),
  stage: z.enum(leadStages).optional(),
  sort: z.enum(["name", "username", "createdAt"]).default("createdAt"),
  order: orderSchema,
});

export const leadBulkDeleteSchema = z.object({
  leadIds: z.array(z.number().int().positive()).min(1).max(maxBulkIds),
});

export const leadCreateSchema = z.object(leadFields);

export const leadUpdateSchema = z.object(leadFields).partial();

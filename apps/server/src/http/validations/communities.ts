import z from "zod";
import { maxBulkIds } from "@repo/constants/pagination";
import {
  orderSchema,
  pageSchema,
  perPageSchema,
  searchSchema,
  skoolUrlSchema,
} from "./skool";

const communityFields = {
  leadId: z.number().int().positive(),
  name: z.string().trim().min(1).max(255),
  skoolUrl: skoolUrlSchema,
  description: z.string().nullish(),
  members: z.number().int().nonnegative().nullish(),
  mrr: z.number().int().nonnegative().nullish(),
  email: z.email().nullish(),
  thumbnailUrl: z.url().nullish(),
  logoUrl: z.url().nullish(),
  isFree: z.boolean(),
  priceCents: z.number().int().nonnegative().nullish(),
  priceCurrency: z.string().length(3).nullish(),
  priceInterval: z.enum(["month", "year", "one_time"]).nullish(),
};

export const communityParamSchema = z.object({
  communityId: z.coerce.number().int().positive(),
});

export const communityListQuerySchema = z
  .object({
    page: pageSchema,
    perPage: perPageSchema,
    search: searchSchema,
    leadId: z.coerce.number().int().positive().optional(),
    campaignId: z.coerce.number().int().positive().optional(),
    isFree: z.stringbool().optional(),
    hasEmail: z.stringbool().optional(),
    minMembers: z.coerce.number().int().nonnegative().optional(),
    maxMembers: z.coerce.number().int().nonnegative().optional(),
    minMrr: z.coerce.number().int().nonnegative().optional(),
    maxMrr: z.coerce.number().int().nonnegative().optional(),
    sort: z
      .enum(["name", "members", "mrr", "priceCents", "createdAt"])
      .default("createdAt"),
    order: orderSchema,
  })
  .refine(
    ({ minMembers, maxMembers }) =>
      minMembers === undefined ||
      maxMembers === undefined ||
      minMembers <= maxMembers,
    { message: "minMembers must not exceed maxMembers", path: ["minMembers"] },
  )
  .refine(
    ({ minMrr, maxMrr }) =>
      minMrr === undefined || maxMrr === undefined || minMrr <= maxMrr,
    { message: "minMrr must not exceed maxMrr", path: ["minMrr"] },
  );

export const communityBulkDeleteSchema = z.object({
  communityIds: z.array(z.number().int().positive()).min(1).max(maxBulkIds),
});

export const communityCreateSchema = z.object(communityFields);

export const communityUpdateSchema = z.object(communityFields).partial();

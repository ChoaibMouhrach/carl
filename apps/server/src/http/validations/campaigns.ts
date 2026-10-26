import z from "zod";
import { maxBulkIds } from "@repo/constants/pagination";
import { orderSchema, pageSchema, perPageSchema, searchSchema } from "./skool";

const campaignFields = {
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(500).nullish(),
  keyword: z.string().trim().min(1).max(255),
  minPriceCents: z.number().int().nonnegative().nullish(),
  minMembers: z.number().int().nonnegative().nullish(),
};

const idList = z.array(z.number().int().positive()).min(1).max(maxBulkIds);

export const campaignParamSchema = z.object({
  campaignId: z.coerce.number().int().positive(),
});

export const campaignListQuerySchema = z.object({
  page: pageSchema,
  perPage: perPageSchema,
  search: searchSchema,
  sort: z.enum(["name", "createdAt"]).default("createdAt"),
  order: orderSchema,
});

export const campaignBulkDeleteSchema = z.object({
  campaignIds: idList,
});

export const campaignCreateSchema = z.object(campaignFields);

export const campaignUpdateSchema = z.object(campaignFields).partial();

export const campaignLeadsSchema = z.object({ leadIds: idList });

export const campaignCommunitiesSchema = z.object({ communityIds: idList });

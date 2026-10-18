import z from "zod";
import {
  campaignStatuses,
  leadStatuses,
  stageNumbers,
} from "@repo/constants/campaign";
import {
  skoolPriceFilters,
  skoolVisibilities,
} from "@server/lib/base-skool-scraper";

const searchSchema = z.object({
  visibility: z.enum(skoolVisibilities),
  price: z.enum(skoolPriceFilters),
});

const campaignFields = {
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().min(1).max(2000).nullable().optional(),
  keyword: z.string().trim().min(1).max(255),
  searches: z.array(searchSchema).min(1).max(6).optional(),
};

export const campaignQuerySchema = z
  .object({
    search: z.string().max(255).optional(),
    page: z.coerce.number().int().positive().gte(1).optional(),
    status: z.enum(campaignStatuses).optional(),
  })
  .optional();

export const campaignIdParamSchema = z.object({
  campaignId: z.coerce.number().int().positive(),
});

export const createCampaignSchema = z.object(campaignFields);

export const updateCampaignSchema = z
  .object({ ...campaignFields, status: z.enum(campaignStatuses) })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field is required.",
  });

export const campaignLeadQuerySchema = z
  .object({
    search: z.string().max(255).optional(),
    page: z.coerce.number().int().positive().gte(1).optional(),
    stage: z.coerce
      .number()
      .int()
      .refine((value): value is (typeof stageNumbers)[number] =>
        stageNumbers.some((stage) => stage === value),
      )
      .optional(),
    status: z.enum(leadStatuses).optional(),
  })
  .optional();

import z from "zod";
import {
  campaignStatuses,
  maxKeywords,
  leadStatuses,
  stageNumbers,
} from "@repo/constants/campaign";
import {
  skoolPriceFilters,
  skoolVisibilities,
} from "@server/lib/base-skool-scraper";

const uniqueKeywords = (keywords: string[]) => {
  const seen = new Set<string>();

  return keywords.filter((keyword) => {
    const key = keyword.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const campaignFields = {
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().min(1).max(2000).nullable().optional(),
  keywords: z
    .array(z.string().trim().min(1).max(255))
    .min(1)
    .max(maxKeywords)
    .transform(uniqueKeywords),
  types: z.array(z.enum(skoolVisibilities)).min(1).optional(),
  pricingModels: z.array(z.enum(skoolPriceFilters)).min(1).optional(),
  minMonthlyPriceUsd: z.number().min(0).nullable().optional(),
  maxMonthlyPriceUsd: z.number().min(0).nullable().optional(),
  minMembers: z.number().int().min(0).nullable().optional(),
  maxMembers: z.number().int().min(0).nullable().optional(),
};

const isOrdered = (min?: number | null, max?: number | null) =>
  min == null || max == null || min <= max;

const hasValidRanges = (body: {
  minMonthlyPriceUsd?: number | null;
  maxMonthlyPriceUsd?: number | null;
  minMembers?: number | null;
  maxMembers?: number | null;
}) =>
  isOrdered(body.minMonthlyPriceUsd, body.maxMonthlyPriceUsd) &&
  isOrdered(body.minMembers, body.maxMembers);

const rangeError = { message: "Minimum cannot be greater than maximum." };

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

export const createCampaignSchema = z
  .object(campaignFields)
  .refine(hasValidRanges, rangeError);

export const updateCampaignSchema = z
  .object({ ...campaignFields, status: z.enum(campaignStatuses) })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field is required.",
  })
  .refine(hasValidRanges, rangeError);

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

export const scrapeQuerySchema = z
  .object({ replace: z.enum(["true", "false"]).optional() })
  .optional();

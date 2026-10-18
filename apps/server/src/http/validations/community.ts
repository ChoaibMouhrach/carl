import z from "zod";

const priceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("free") }),
  z.object({
    type: z.literal("paid"),
    interval: z.enum(["month", "year", "one_time"]),
    amount: z.number().int().nonnegative(),
    currency: z.string().trim().length(3).toUpperCase(),
  }),
]);

const optionalText = (max: number) =>
  z.string().trim().min(1).max(max).nullable().optional();

const communityFields = {
  leadId: z.number().int().positive(),
  name: z.string().trim().min(1).max(255),
  displayName: z.string().trim().min(1).max(255),
  communityUrl: z.url().max(2048),
  description: optionalText(2000),
  longDescription: optionalText(20000),
  memberCount: z.number().int().nonnegative(),
  skoolCreatedAt: z.coerce.date().nullable().optional(),
  recentActivity: z.coerce.date().nullable().optional(),
  membershipQuestions: z
    .array(
      z.object({
        question: z.string().trim().min(1).max(1000),
        type: z.string().trim().min(1).max(100),
        options: z.array(z.string().max(500)).max(50).optional(),
      }),
    )
    .max(50)
    .optional(),
  prices: z.array(priceSchema).min(1).max(10),
  salesMotionQuote: optionalText(2000),
};

export const communityQuerySchema = z
  .object({
    search: z.string().max(255).optional(),
    page: z.coerce.number().int().positive().gte(1).optional(),
    pricingType: z.enum(["free", "paid"]).optional(),
    leadId: z.coerce.number().int().positive().optional(),
    minMembers: z.coerce.number().int().nonnegative().optional(),
    minRevenue: z.coerce.number().nonnegative().optional(),
    sortBy: z
      .enum(["estMonthlyRevenue", "memberCount", "createdAt", "name"])
      .optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
  })
  .optional();

export const communityIdParamSchema = z.object({
  communityId: z.coerce.number().int().positive(),
});

export const createCommunitySchema = z.object({
  skoolId: z.string().trim().min(1).max(255),
  ...communityFields,
});

export const updateCommunitySchema = z
  .object(communityFields)
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field is required.",
  });

export type PriceInput = z.infer<typeof priceSchema>;

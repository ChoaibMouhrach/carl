import z from "zod";

const optionalText = (max: number) =>
  z.string().trim().min(1).max(max).nullable().optional();
const optionalUrl = z.url().max(2048).nullable().optional();

const leadFields = {
  name: z.string().trim().min(1).max(255),
  firstName: optionalText(255),
  lastName: optionalText(255),
  bio: optionalText(5000),
  location: optionalText(255),
  website: optionalUrl,
  linkedinUrl: optionalUrl,
  facebookUrl: optionalUrl,
  instagramUrl: optionalUrl,
  twitterUrl: optionalUrl,
  youtubeUrl: optionalUrl,
};

export const leadQuerySchema = z
  .object({
    search: z.string().max(255).optional(),
    page: z.coerce.number().int().positive().gte(1).optional(),
    hasWebsite: z.enum(["true", "false"]).optional(),
    sortBy: z.enum(["createdAt", "name", "communityCount"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
  })
  .optional();

export const leadIdParamSchema = z.object({
  leadId: z.coerce.number().int().positive(),
});

export const createLeadSchema = z.object({
  skoolUsername: z.string().trim().min(1).max(255),
  ...leadFields,
});

export const updateLeadSchema = z
  .object(leadFields)
  .partial()
  .extend({ name: leadFields.name.optional() })
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field is required.",
  });

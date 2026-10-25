import z from "zod";

export const scrapeBodySchema = z
  .object({
    search: z.string().trim().min(1),
    minPrice: z.number().nonnegative().optional(),
    maxPrice: z.number().nonnegative().optional(),
    minMembers: z.number().int().nonnegative().optional(),
    maxMembers: z.number().int().nonnegative().optional(),
  })
  .refine(
    ({ minPrice, maxPrice }) =>
      minPrice === undefined || maxPrice === undefined || minPrice <= maxPrice,
    { message: "minPrice must not exceed maxPrice", path: ["minPrice"] },
  )
  .refine(
    ({ minMembers, maxMembers }) =>
      minMembers === undefined ||
      maxMembers === undefined ||
      minMembers <= maxMembers,
    { message: "minMembers must not exceed maxMembers", path: ["minMembers"] },
  );

import { z } from "zod";

export const notificationListQuerySchema = z.object({
  cursor: z.coerce.number().int().positive().optional(),
});

export const notificationIdSchema = z.object({
  notificationId: z.coerce.number().int().positive(),
});

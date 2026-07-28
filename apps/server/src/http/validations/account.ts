import { ACCOUNT_DELETION_CONFIRMATION } from "@repo/constants/auth";
import z from "zod";

export const deleteAccountSchema = z.object({
  confirmation: z.literal(ACCOUNT_DELETION_CONFIRMATION),
});

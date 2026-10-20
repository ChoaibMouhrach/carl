import z from "zod";
import { answerValues } from "@repo/constants/filter";

/** The answer the AI must give for one lead, whichever provider is behind it */
export const classifierAnswerSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.number().int(),
      answer: z.enum(answerValues),
      evidence: z.string(),
    }),
  ),
  summary: z.string(),
});

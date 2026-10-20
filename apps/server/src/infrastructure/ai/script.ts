import type IORedis from "ioredis";
import z from "zod";
import { answerValues } from "@repo/constants/filter";

const SCRIPT_TTL_SECONDS = 3_600;

export const leadScriptSchema = z.object({
  /** Answers by the question's label, as typed in the settings */
  answers: z.record(
    z.string(),
    z.object({
      answer: z.enum(answerValues),
      evidence: z.string().optional(),
    }),
  ),
  summary: z.string().optional(),
});

export type LeadScript = z.infer<typeof leadScriptSchema>;

export const leadScriptKey = (username: string) => `ai-script:lead:${username}`;

export const writeLeadScript = async (
  redis: IORedis,
  username: string,
  script: LeadScript,
) => {
  await redis.set(
    leadScriptKey(username),
    JSON.stringify(leadScriptSchema.parse(script)),
    "EX",
    SCRIPT_TTL_SECONDS,
  );
};

export const clearLeadScript = async (redis: IORedis, username: string) => {
  await redis.del(leadScriptKey(username));
};

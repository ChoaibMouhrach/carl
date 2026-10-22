import type IORedis from "ioredis";
import z from "zod";
import type { EmailLookup } from "../../lib/base-email-finder";

const SCRIPT_TTL_SECONDS = 3_600;

export const emailFinderScriptSchema = z.object({
  email: z.string().nullable(),
  delayMs: z.number().int().min(0).max(30_000).optional(),
});

export type EmailFinderScript = z.input<typeof emailFinderScriptSchema>;

export const lookupIdentity = (
  lookup: Pick<
    EmailLookup,
    "firstName" | "lastName" | "domain" | "linkedinUrl"
  >,
) =>
  lookup.linkedinUrl ??
  [lookup.firstName, lookup.lastName, lookup.domain].join(" ");

export const emailFinderScriptKey = (identity: string) =>
  `email-script:lookup:${identity}`;

export const writeEmailFinderScript = async (
  redis: IORedis,
  identity: string,
  script: EmailFinderScript,
) => {
  await redis.set(
    emailFinderScriptKey(identity),
    JSON.stringify(emailFinderScriptSchema.parse(script)),
    "EX",
    SCRIPT_TTL_SECONDS,
  );
};

export const clearEmailFinderScript = async (
  redis: IORedis,
  identity: string,
) => {
  await redis.del(emailFinderScriptKey(identity));
};

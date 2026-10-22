import type IORedis from "ioredis";
import z from "zod";

const SCRIPT_TTL_SECONDS = 3_600;

export const webSearchScriptSchema = z.object({
  results: z.array(
    z.object({
      url: z.string(),
      title: z.string().default(""),
      content: z.string().default(""),
    }),
  ),
  delayMs: z.number().int().min(0).max(30_000).optional(),
});

export type WebSearchScript = z.input<typeof webSearchScriptSchema>;

export const webSearchScriptKey = (query: string) =>
  `search-script:query:${query}`;

export const writeWebSearchScript = async (
  redis: IORedis,
  query: string,
  script: WebSearchScript,
) => {
  await redis.set(
    webSearchScriptKey(query),
    JSON.stringify(webSearchScriptSchema.parse(script)),
    "EX",
    SCRIPT_TTL_SECONDS,
  );
};

export const clearWebSearchScript = async (redis: IORedis, query: string) => {
  await redis.del(webSearchScriptKey(query));
};

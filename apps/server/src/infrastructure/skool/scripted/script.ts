import type IORedis from "ioredis";
import z from "zod";

const KEY_PREFIX = "skool-script";
const TTL_SECONDS = 60 * 60;

export const scriptedOwnerSchema = z.object({
  username: z.string(),
  name: z.string().optional(),
  bio: z.string().optional(),
  email: z.string().optional(),
  website: z.string().optional(),
  linkedinUrl: z.string().optional(),
});

export const scriptedCommunitySchema = z.object({
  name: z.string(),
  displayName: z.string().optional(),
  memberCount: z.number(),
  /** Cents */
  price: z
    .object({
      amount: z.number(),
      interval: z.enum(["month", "year", "one_time"]),
    })
    .optional(),
  /** `null` is a community whose owner Skool does not show */
  owner: scriptedOwnerSchema.nullable(),
  failAbout: z.boolean().optional(),
});

export const skoolScriptSchema = z.object({
  keyword: z.string(),
  /** Communities found by each search, keyed like `public-paid` */
  searches: z.record(z.string(), z.array(scriptedCommunitySchema)),
  failDiscovery: z.string().optional(),
  failProfileFor: z.array(z.string()).optional(),
});

export const scriptedProfileSchema = z.object({
  owner: scriptedOwnerSchema,
  fail: z.boolean().optional(),
});

export type ScriptedOwner = z.infer<typeof scriptedOwnerSchema>;
export type ScriptedCommunity = z.infer<typeof scriptedCommunitySchema>;
export type SkoolScript = z.infer<typeof skoolScriptSchema>;

const keywordKey = (keyword: string) => `${KEY_PREFIX}:keyword:${keyword}`;
const communityKey = (name: string) => `${KEY_PREFIX}:community:${name}`;
const ownerKey = (username: string) => `${KEY_PREFIX}:owner:${username}`;

export const writeSkoolScript = async (redis: IORedis, script: SkoolScript) => {
  const communities = Object.values(script.searches).flat();
  const entries: [string, string][] = [
    [keywordKey(script.keyword), JSON.stringify(script)],
    ...communities.map((community): [string, string] => [
      communityKey(community.name),
      JSON.stringify(community),
    ]),
    ...communities.flatMap((community) =>
      community.owner
        ? [
            [
              ownerKey(community.owner.username),
              JSON.stringify({
                owner: community.owner,
                fail: script.failProfileFor?.includes(community.owner.username),
              }),
            ] satisfies [string, string],
          ]
        : [],
    ),
  ];

  for (const [key, value] of entries) {
    await redis.set(key, value, "EX", TTL_SECONDS);
  }
};

export const clearSkoolScript = async (redis: IORedis, script: SkoolScript) => {
  const communities = Object.values(script.searches).flat();

  await redis.del(
    keywordKey(script.keyword),
    ...communities.map((community) => communityKey(community.name)),
    ...communities.flatMap((community) =>
      community.owner ? [ownerKey(community.owner.username)] : [],
    ),
  );
};

export const scriptKeys = { keywordKey, communityKey, ownerKey };

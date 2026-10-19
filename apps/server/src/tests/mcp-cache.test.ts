import { expect, test } from "bun:test";
import IORedis from "ioredis";
import z from "zod";
import { initENV } from "@server/config/env";
import { SKOOL_LOOKUP_CACHE_TTL_SECONDS } from "@server/config/constants";
import { RedisCache } from "@server/infrastructure/cache/redis";
import { TestLogger } from "./helpers/context";
import { withTestDatabase } from "./helpers/http";
import { callTool, setup } from "./helpers/mcp";

test("every answer is kept for an hour", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token, context } = await setup(db, pool);

    await callTool(admin.app, token, "search_communities", {
      keyword: "builders",
    });
    await callTool(admin.app, token, "get_community", { name: "big-club" });
    await callTool(admin.app, token, "get_owner", { username: "jane" });

    expect([...context.cache.ttls.values()]).toEqual([
      SKOOL_LOOKUP_CACHE_TTL_SECONDS,
      SKOOL_LOOKUP_CACHE_TTL_SECONDS,
      SKOOL_LOOKUP_CACHE_TTL_SECONDS,
    ]);
  });
});

test("a community and a person with the same name are cached apart", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token, scraper, context } = await setup(db, pool);

    await callTool(admin.app, token, "get_community", { name: "big-club" });
    await callTool(admin.app, token, "get_owner", { username: "big-club" });

    expect(scraper.aboutCalls).toEqual(["big-club"]);
    expect(scraper.profileCalls).toEqual(["big-club"]);
    expect(context.cache.entries.size).toBe(2);
  });
});

test("a damaged cache entry is replaced by a fresh answer instead of failing the call", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token, scraper, context } = await setup(db, pool);
    const key = "skool-lookup:community:big-club";
    context.cache.entries.set(key, "{not json");

    const result = await callTool(admin.app, token, "get_community", {
      name: "big-club",
    });

    expect(result.isError).toBe(false);
    expect(scraper.aboutCalls).toEqual(["big-club"]);
    expect(
      z
        .object({ name: z.string() })
        .parse(JSON.parse(context.cache.entries.get(key) ?? "")).name,
    ).toBe("big-club");
  });
});

test("a cached answer is returned without asking Skool again, even for a differently cased name", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token, scraper } = await setup(db, pool);

    const first = await callTool(admin.app, token, "get_owner", {
      username: "Jane",
    });
    const second = await callTool(admin.app, token, "get_owner", {
      username: " jane ",
    });

    expect(second.text).toBe(first.text);
    expect(scraper.profileCalls).toEqual(["Jane"]);
  });
});

test("the Redis cache stores a value under its own prefix with an expiry and misses on an unknown key", async () => {
  const url = initENV().REDIS_CONNECTION_STRING;
  const cache = new RedisCache({ logger: new TestLogger(), redisUrl: url });
  const redis = new IORedis(url);
  const key = `test-${crypto.randomUUID()}`;

  try {
    expect(await cache.get(key)).toBeNull();

    await cache.set(key, "value", 60);

    expect(await cache.get(key)).toBe("value");
    expect(await redis.get(`carl:cache:${key}`)).toBe("value");
    const ttl = await redis.ttl(`carl:cache:${key}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);

    await cache.set(key, "newer", 60);
    expect(await cache.get(key)).toBe("newer");
  } finally {
    await redis.del(`carl:cache:${key}`);
    await redis.quit();
    await cache.close();
  }
});

test("a cache that cannot reach Redis misses and swallows writes instead of throwing", async () => {
  const cache = new RedisCache({
    logger: new TestLogger(),
    redisUrl: "redis://127.0.0.1:1",
  });

  try {
    expect(await cache.get("anything")).toBeNull();
    await cache.set("anything", "value", 60);
  } finally {
    await cache.close();
  }
});

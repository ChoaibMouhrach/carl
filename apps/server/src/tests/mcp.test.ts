import { expect, test } from "bun:test";
import z from "zod";
import { oauthAccessTokenTable } from "@server/infrastructure/database/schemas";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";
import {
  callTool,
  countRows,
  issueToken,
  rpc,
  setup,
  toolResult,
} from "./helpers/mcp";

test("the MCP endpoint refuses a caller with no token or an unknown one", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin } = await setup(db, pool);

    const anonymous = await rpc(admin.app, null, "tools/list");
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("www-authenticate")).toContain(
      "oauth-protected-resource",
    );

    const unknown = await rpc(admin.app, "not-a-token", "tools/list");
    expect(unknown.status).toBe(401);
  });
});

test("a token that belongs to a non-admin is refused", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context } = await setup(db, pool);
    const member = await createAuthenticatedApp({
      context,
      email: "agent-member@example.com",
    });
    const token = await issueToken(db, member.user.userId, "member");

    const response = await rpc(member.app, token, "tools/list");

    expect(response.status).toBe(403);
  });
});

test("an expired token is refused", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token } = await setup(db, pool);
    await db
      .update(oauthAccessTokenTable)
      .set({ accessTokenExpiresAt: new Date(Date.now() - 1_000) });

    const response = await rpc(admin.app, token, "tools/list");

    expect(response.status).toBe(401);
  });
});

test("an admin's agent lists exactly the three read-only Skool tools", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token } = await setup(db, pool);

    const response = await rpc(admin.app, token, "tools/list");
    const body = z
      .object({
        result: z.object({
          tools: z.array(
            z.object({
              name: z.string(),
              annotations: z.object({ readOnlyHint: z.boolean() }),
            }),
          ),
        }),
      })
      .parse(await response.json());

    expect(body.result.tools.map((tool) => tool.name).toSorted()).toEqual([
      "get_community",
      "get_owner",
      "search_communities",
    ]);
    expect(
      body.result.tools.every((tool) => tool.annotations.readOnlyHint),
    ).toBe(true);
  });
});

test("searching returns communities with their prices and stores nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token } = await setup(db, pool);
    const before = await countRows(db);

    const result = await callTool(admin.app, token, "search_communities", {
      keyword: "builders",
    });

    expect(result.isError).toBe(false);
    const found = z
      .object({
        totalGroups: z.number(),
        communities: z.array(
          z.object({
            name: z.string(),
            url: z.string(),
            memberCount: z.number(),
            pricingType: z.string(),
            monthlyPriceUsd: z.number().nullable(),
          }),
        ),
      })
      .parse(JSON.parse(result.text));
    expect(found.communities.map((community) => community.name)).toEqual([
      "big-club",
      "small-club",
    ]);
    expect(found.communities[0]).toMatchObject({
      url: "https://www.skool.com/big-club",
      memberCount: 900,
      pricingType: "paid",
    });
    expect(found.communities[0]?.monthlyPriceUsd).toBeGreaterThan(0);
    expect(await countRows(db)).toEqual(before);
  });
});

test("member and price limits narrow a search", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token } = await setup(db, pool);
    const names = async (args: object) => {
      const result = await callTool(admin.app, token, "search_communities", {
        keyword: "builders",
        ...args,
      });
      return z
        .object({ communities: z.array(z.object({ name: z.string() })) })
        .parse(JSON.parse(result.text))
        .communities.map((community) => community.name);
    };

    expect(await names({ minMembers: 100 })).toEqual(["big-club"]);
    expect(await names({ maxMembers: 100 })).toEqual(["small-club"]);
    expect(await names({ minMonthlyPriceUsd: 100000 })).toEqual([]);
  });
});

test("a repeated search is served from the cache, and a different one is not", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token, scraper } = await setup(db, pool);

    await callTool(admin.app, token, "search_communities", {
      keyword: "builders",
    });
    await callTool(admin.app, token, "search_communities", {
      keyword: "  Builders ",
      minMembers: 100,
    });
    expect(scraper.discoverCalls).toHaveLength(1);

    await callTool(admin.app, token, "search_communities", {
      keyword: "coaches",
    });
    await callTool(admin.app, token, "search_communities", {
      keyword: "builders",
      page: 2,
    });
    expect(scraper.discoverCalls).toHaveLength(3);
  });
});

test("a community lookup returns its owner and the emails in their bio, stores nothing and is cached", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token, scraper } = await setup(db, pool);
    const before = await countRows(db);

    const first = await callTool(admin.app, token, "get_community", {
      name: "big-club",
    });
    const second = await callTool(admin.app, token, "get_community", {
      name: "Big-Club",
    });

    expect(first.isError).toBe(false);
    const detail = z
      .object({
        name: z.string(),
        url: z.string(),
        owner: z.object({ username: z.string(), emails: z.array(z.string()) }),
      })
      .parse(JSON.parse(first.text));
    expect(detail).toMatchObject({
      name: "big-club",
      url: "https://www.skool.com/big-club",
      owner: { username: "jane", emails: ["jane@example.com"] },
    });
    expect(second.text).toBe(first.text);
    expect(scraper.aboutCalls).toHaveLength(1);
    expect(await countRows(db)).toEqual(before);
  });
});

test("an owner lookup returns their profile and stores nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token, scraper } = await setup(db, pool);
    scraper.profileBios.jane = "Reach me at jane@example.com";
    const before = await countRows(db);

    const result = await callTool(admin.app, token, "get_owner", {
      username: "jane",
    });

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.text)).toMatchObject({
      username: "jane",
      emails: ["jane@example.com"],
    });
    expect(scraper.profileCalls).toEqual(["jane"]);
    expect(await countRows(db)).toEqual(before);
  });
});

test("a Skool failure comes back as a tool error, is not cached and the next call retries", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token, scraper, context } = await setup(db, pool);
    scraper.failingAbout.add("big-club");

    const failed = await callTool(admin.app, token, "get_community", {
      name: "big-club",
    });

    expect(failed.isError).toBe(true);
    expect(context.cache.entries.size).toBe(0);

    scraper.failingAbout.delete("big-club");
    const retried = await callTool(admin.app, token, "get_community", {
      name: "big-club",
    });
    expect(retried.isError).toBe(false);
  });
});

test("invalid tool input is refused without calling Skool", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token, scraper } = await setup(db, pool);

    const response = await rpc(admin.app, token, "tools/call", {
      name: "search_communities",
      arguments: { keyword: "", page: 0 },
    });
    const body = toolResult.parse(await response.json());

    expect(body.result.isError).toBe(true);
    expect(scraper.discoverCalls).toEqual([]);
  });
});

test("the OAuth discovery documents are public and point at the MCP endpoint", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin } = await setup(db, pool);

    const authorization = await admin.app.request(
      "/.well-known/oauth-authorization-server",
    );
    const resource = await admin.app.request(
      "/.well-known/oauth-protected-resource",
    );

    expect(authorization.status).toBe(200);
    expect(
      z.object({ issuer: z.string() }).parse(await authorization.json()).issuer,
    ).toBeTruthy();
    expect(resource.status).toBe(200);
    expect(
      z.object({ resource: z.string() }).parse(await resource.json()).resource,
    ).toEndWith("/api/mcp");
  });
});

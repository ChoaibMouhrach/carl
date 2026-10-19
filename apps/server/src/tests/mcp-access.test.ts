import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import {
  oauthApplicationTable,
  userTable,
} from "@server/infrastructure/database/schemas";
import { withTestDatabase } from "./helpers/http";
import { countRows, issueToken, rpc, setup } from "./helpers/mcp";

const searchCall = {
  name: "search_communities",
  arguments: { keyword: "builders" },
};

test("a banned admin's token is refused and nothing reaches Skool or the cache", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token, scraper, context } = await setup(db, pool);
    await db
      .update(userTable)
      .set({ banned: true })
      .where(eq(userTable.id, admin.user.userId));

    const response = await rpc(admin.app, token, "tools/call", searchCall);

    expect(response.status).toBe(403);
    // Refused before any tool ran, so no Skool call and no cache write could happen
    expect(scraper.discoverCalls).toEqual([]);
    expect(context.cache.entries.size).toBe(0);
  });
});

test("an admin who is demoted loses access on the very next call", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token, scraper } = await setup(db, pool);
    expect((await rpc(admin.app, token, "tools/list")).status).toBe(200);

    await db
      .update(userTable)
      .set({ role: "user" })
      .where(eq(userTable.id, admin.user.userId));

    expect((await rpc(admin.app, token, "tools/list")).status).toBe(403);
    expect((await rpc(admin.app, token, "tools/call", searchCall)).status).toBe(
      403,
    );
    expect(scraper.discoverCalls).toEqual([]);
  });
});

test("deleting the user removes their tokens and the agent is signed out", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token } = await setup(db, pool);

    await db.delete(userTable).where(eq(userTable.id, admin.user.userId));

    expect((await rpc(admin.app, token, "tools/list")).status).toBe(401);
    expect(await db.$count(oauthApplicationTable)).toBe(1);
  });
});

test("a token with no user behind it is refused as unauthenticated", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin } = await setup(db, pool);
    const orphan = await issueToken(db, null, "orphan");

    const response = await rpc(admin.app, orphan, "tools/list");

    expect(response.status).toBe(401);
  });
});

test("a refresh token cannot be used as an access token", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin } = await setup(db, pool);

    const response = await rpc(admin.app, "refresh-admin", "tools/list");

    expect(response.status).toBe(401);
  });
});

test("a token of a disabled client is refused", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token } = await setup(db, pool);
    await db.update(oauthApplicationTable).set({ disabled: true });

    const response = await rpc(admin.app, token, "tools/list");

    expect(response.status).toBe(401);
  });
});

for (const [label, header] of [
  ["an empty bearer value", "Bearer "],
  ["another scheme", "Basic dXNlcjpwYXNz"],
  ["a bare word", "Bearer"],
] as const) {
  test(`${label} in the authorization header is refused`, async () => {
    await withTestDatabase(async ({ db, pool }) => {
      const { admin } = await setup(db, pool);

      const response = await admin.app.request("/api/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: header,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });

      expect(response.status).toBe(401);
    });
  });
}

test("a refused call changes no platform data and no token", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin } = await setup(db, pool);
    const before = await countRows(db);

    await rpc(admin.app, "unknown", "tools/call", searchCall);

    expect(await countRows(db)).toEqual(before);
    expect(await db.$count(oauthApplicationTable)).toBe(1);
  });
});

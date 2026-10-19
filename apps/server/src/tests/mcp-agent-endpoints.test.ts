import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import z from "zod";
import {
  mcpRequestsTable,
  oauthAccessTokenTable,
} from "@server/infrastructure/database/schemas";
import { callTool, setup } from "./helpers/mcp";
import { withTestDatabase } from "./helpers/http";

type Session = Awaited<ReturnType<typeof setup>>;

const get = (session: Session, path: string) =>
  session.admin.app.request(path, {
    headers: { cookie: session.admin.cookie },
  });

const agentBody = z.object({
  agent: z.object({
    clientId: z.string(),
    userEmail: z.string().nullable(),
    connectedAt: z.string(),
    lastActiveAt: z.string(),
    requestCount: z.number(),
    errorCount: z.number(),
  }),
});

const listBody = z.object({
  requests: z.array(z.object({ mcpRequestId: z.number() })),
  meta: z.object({ page: z.number(), lastPage: z.number(), total: z.number() }),
});

const refused = [
  ["page 0", "?page=0"],
  ["a page that is not a number", "?page=abc"],
  ["a negative page", "?page=-3"],
  ["a fractional page", "?page=1.5"],
] as const;

for (const [label, query] of refused) {
  test(`the request list refuses ${label}`, async () => {
    await withTestDatabase(async ({ db, pool }) => {
      const session = await setup(db, pool);

      const response = await get(
        session,
        `/api/agents/client-admin/requests${query}`,
      );

      // A malformed page fails validation before any query is made
      expect(response.status).toBe(400);
    });
  });
}

test("a page far past the end is an empty page with honest paging, not an error", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    await callTool(session.admin.app, session.token, "get_owner", {
      username: "a",
    });

    const response = await get(
      session,
      "/api/agents/client-admin/requests?page=9999",
    );
    const body = listBody.parse(await response.json());

    expect(response.status).toBe(200);
    expect(body.requests).toEqual([]);
    expect(body.meta).toEqual({ page: 9999, lastPage: 1, total: 1 });
  });
});

test("an empty history is one empty page", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);

    const body = listBody.parse(
      await (await get(session, "/api/agents/client-admin/requests")).json(),
    );

    expect(body.requests).toEqual([]);
    expect(body.meta).toEqual({ page: 1, lastPage: 1, total: 0 });
  });
});

test("a request id that is not a positive whole number is refused", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);

    for (const id of ["abc", "-1", "0", "1.5"]) {
      const response = await get(
        session,
        `/api/agents/client-admin/requests/${id}`,
      );
      expect([id, response.status]).toEqual([id, 400]);
    }
  });
});

test("a request id too large for the database is a bad request, not a server error", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);

    const response = await get(
      session,
      "/api/agents/client-admin/requests/99999999999",
    );

    expect(response.status).toBe(400);
  });
});

test("an agent id with path characters, or at the length limit, is just an unknown agent", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);

    const dots = await get(session, "/api/agents/..%2Fadmin");
    const encoded = await get(session, "/api/agents/%25%20name");
    const longest = await get(session, `/api/agents/${"a".repeat(255)}`);
    const tooLong = await get(session, `/api/agents/${"a".repeat(256)}`);

    expect([dots.status, encoded.status, longest.status]).toEqual([
      404, 404, 404,
    ]);
    expect(tooLong.status).toBe(400);
  });
});

test("an agent that refreshed its token is still one agent, connected at its earliest token", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const [first] = await db.select().from(oauthAccessTokenTable);
    const earlier = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    await db
      .update(oauthAccessTokenTable)
      .set({ createdAt: earlier })
      .where(eq(oauthAccessTokenTable.id, first?.id ?? ""));
    await db.insert(oauthAccessTokenTable).values({
      id: "refreshed",
      accessToken: "access-refreshed",
      refreshToken: "refresh-refreshed",
      accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
      refreshTokenExpiresAt: new Date(Date.now() + 3_600_000),
      clientId: "client-admin",
      userId: session.admin.user.userId,
      scopes: "openid",
    });

    const list = z
      .object({
        agents: z.array(
          z.object({ clientId: z.string(), connectedAt: z.string() }),
        ),
      })
      .parse(await (await get(session, "/api/agents")).json());
    const detail = agentBody.parse(
      await (await get(session, "/api/agents/client-admin")).json(),
    );

    expect(
      list.agents.filter((agent) => agent.clientId === "client-admin"),
    ).toHaveLength(1);
    expect(new Date(detail.agent.connectedAt).getTime()).toBe(
      earlier.getTime(),
    );
  });
});

test("an agent that has made no requests was last active when its token last changed", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const [token] = await db.select().from(oauthAccessTokenTable);

    const detail = agentBody.parse(
      await (await get(session, "/api/agents/client-admin")).json(),
    );

    expect(detail.agent.requestCount).toBe(0);
    expect(new Date(detail.agent.lastActiveAt).getTime()).toBe(
      token?.updatedAt.getTime() ?? 0,
    );
  });
});

test("an agent's last activity is the time of its newest request", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    await callTool(session.admin.app, session.token, "get_owner", {
      username: "a",
    });
    await callTool(session.admin.app, session.token, "get_owner", {
      username: "b",
    });
    const rows = await db.select().from(mcpRequestsTable);
    const newest = Math.max(...rows.map((row) => row.createdAt.getTime()));

    const detail = agentBody.parse(
      await (await get(session, "/api/agents/client-admin")).json(),
    );

    expect(detail.agent.requestCount).toBe(2);
    expect(new Date(detail.agent.lastActiveAt).getTime()).toBe(newest);
  });
});

test("the counts on an agent's page count every kind of failure once", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    session.scraper.failingAbout.add("big-club");
    await callTool(session.admin.app, session.token, "get_owner", {
      username: "fine",
    });
    await callTool(session.admin.app, session.token, "get_community", {
      name: "big-club",
    });
    await callTool(session.admin.app, session.token, "create_lead", {
      skoolUsername: "",
      name: "",
    });

    const detail = agentBody.parse(
      await (await get(session, "/api/agents/client-admin")).json(),
    );

    expect(detail.agent).toMatchObject({ requestCount: 3, errorCount: 2 });
  });
});

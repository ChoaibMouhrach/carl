import { expect, test } from "bun:test";
import z from "zod";
import { asc, eq } from "drizzle-orm";
import {
  mcpRequestsTable,
  oauthAccessTokenTable,
} from "@server/infrastructure/database/schemas";
import { Services } from "@server/services";
import { createAdminClient } from "./helpers/api";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";
import { callTool, issueToken, rpc, setup } from "./helpers/mcp";

const agentList = z.object({
  agents: z.array(
    z.object({
      clientId: z.string(),
      name: z.string(),
      userEmail: z.string().nullable(),
      connectedAt: z.string(),
      lastActiveAt: z.string(),
    }),
  ),
});

test("only admins can list or revoke connected agents", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin, token } = await setup(db, pool);
    const member = await createAuthenticatedApp({
      context,
      email: "agents-member@example.com",
    });
    const headers = { cookie: member.cookie };

    const listed = await member.app.request("/api/agents", { headers });
    const revoked = await member.app.request("/api/agents/client-admin", {
      method: "DELETE",
      headers,
    });
    const anonymous = await admin.app.request("/api/agents");

    expect(listed.status).toBe(403);
    expect(revoked.status).toBe(403);
    expect(anonymous.status).toBe(401);
    // Both refusals happen before any write, and the agent's token is still there
    expect((await rpc(admin.app, token, "tools/list")).status).toBe(200);
    expect(await db.$count(oauthAccessTokenTable)).toBe(1);
  });
});

test("the list shows each connected agent with who connected it", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, context } = await setup(db, pool);
    const second = await createAdminClient(context, "second-admin@example.com");
    await issueToken(db, second.user.userId, "other");

    const response = await admin.app.request("/api/agents", {
      headers: { cookie: admin.cookie },
    });
    const { agents } = agentList.parse(await response.json());

    expect(response.status).toBe(200);
    expect(
      agents
        .map((agent) => [agent.clientId, agent.name, agent.userEmail])
        .toSorted(),
    ).toEqual([
      ["client-admin", "Agent", "agent-admin@example.com"],
      ["client-other", "Agent", "second-admin@example.com"],
    ]);
  });
});

test("with no agents connected the list is empty", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context } = await setup(db, pool);
    await db.delete(oauthAccessTokenTable);
    const admin = await createAdminClient(context, "empty-agents@example.com");

    const response = await admin.get("/api/agents");

    expect(agentList.parse(await response.json()).agents).toEqual([]);
  });
});

test("revoking an agent removes its tokens, signs it out and leaves other agents alone", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token } = await setup(db, pool);
    const other = await issueToken(db, admin.user.userId, "keep");

    const response = await admin.app.request("/api/agents/client-admin", {
      method: "DELETE",
      headers: { cookie: admin.cookie },
    });

    expect(response.status).toBe(204);
    const remaining = await db.select().from(oauthAccessTokenTable);
    expect(remaining.map((row) => row.clientId)).toEqual(["client-keep"]);
    expect((await rpc(admin.app, token, "tools/list")).status).toBe(401);
    expect((await rpc(admin.app, other, "tools/list")).status).toBe(200);
  });
});

test("revoking an agent that is not connected is a 404 and removes nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin } = await setup(db, pool);

    const response = await admin.app.request("/api/agents/nobody", {
      method: "DELETE",
      headers: { cookie: admin.cookie },
    });

    expect(response.status).toBe(404);
    expect(await db.$count(oauthAccessTokenTable)).toBe(1);
  });
});

const listedRequests = z.object({
  requests: z.array(
    z.object({
      mcpRequestId: z.number(),
      rpcMethod: z.string(),
      toolName: z.string().nullable(),
      statusCode: z.number(),
      isError: z.boolean(),
      durationMs: z.number(),
    }),
  ),
  meta: z.object({ page: z.number(), lastPage: z.number(), total: z.number() }),
});

test("every authorized call is recorded with what was asked and what was answered", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token } = await setup(db, pool);

    await callTool(admin.app, token, "search_communities", {
      keyword: "builders",
    });

    const rows = await db.select().from(mcpRequestsTable);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      clientId: "client-admin",
      userId: admin.user.userId,
      rpcMethod: "tools/call",
      toolName: "search_communities",
      statusCode: 200,
      isError: false,
    });
    expect(JSON.parse(rows[0]?.requestBody ?? "")).toMatchObject({
      params: {
        name: "search_communities",
        arguments: { keyword: "builders" },
      },
    });
    expect(rows[0]?.responseBody).toContain("big-club");
    expect(rows[0]?.durationMs).toBeGreaterThanOrEqual(0);
  });
});

test("a failed tool is recorded as an error and a batch lists every method", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token, scraper } = await setup(db, pool);
    scraper.failingAbout.add("big-club");

    await callTool(admin.app, token, "get_community", { name: "big-club" });
    await admin.app.request("/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        { jsonrpc: "2.0", id: 2, method: "ping" },
      ]),
    });

    const rows = await db
      .select()
      .from(mcpRequestsTable)
      .orderBy(asc(mcpRequestsTable.mcpRequestId));
    expect(rows.map((row) => [row.rpcMethod, row.isError])).toEqual([
      ["tools/call", true],
      ["tools/list, ping", false],
    ]);
  });
});

test("refused calls are not recorded", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, context } = await setup(db, pool);
    const member = await createAuthenticatedApp({
      context,
      email: "log-member@example.com",
    });
    const memberToken = await issueToken(db, member.user.userId, "log-member");

    await rpc(admin.app, "nope", "tools/list");
    await rpc(admin.app, null, "tools/list");
    await rpc(member.app, memberToken, "tools/list");

    expect(await db.$count(mcpRequestsTable)).toBe(0);
  });
});

test("an agent's page shows who connected it, its client and its request counts", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token, scraper } = await setup(db, pool);
    scraper.failingAbout.add("big-club");
    await callTool(admin.app, token, "search_communities", {
      keyword: "builders",
    });
    await callTool(admin.app, token, "get_community", { name: "big-club" });

    const response = await admin.app.request("/api/agents/client-admin", {
      headers: { cookie: admin.cookie },
    });
    const body = z
      .object({
        agent: z.object({
          clientId: z.string(),
          name: z.string(),
          userEmail: z.string().nullable(),
          redirectUrls: z.array(z.string()),
          requestCount: z.number(),
          errorCount: z.number(),
          lastActiveAt: z.string(),
        }),
      })
      .parse(await response.json());

    expect(response.status).toBe(200);
    expect(body.agent).toMatchObject({
      clientId: "client-admin",
      name: "Agent",
      userEmail: "agent-admin@example.com",
      redirectUrls: ["http://localhost/callback"],
      requestCount: 2,
      errorCount: 1,
    });
  });
});

test("the request list is newest first, paged and leaves out the bodies", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token } = await setup(db, pool);
    for (let index = 0; index < 13; index += 1) {
      await callTool(admin.app, token, "get_owner", {
        username: `user-${index}`,
      });
    }
    const get = async (query: string) => {
      const response = await admin.app.request(
        `/api/agents/client-admin/requests${query}`,
        { headers: { cookie: admin.cookie } },
      );
      return { status: response.status, text: await response.text() };
    };

    const first = await get("");
    const second = await get("?page=2");
    const firstPage = listedRequests.parse(JSON.parse(first.text));
    const secondPage = listedRequests.parse(JSON.parse(second.text));

    expect(first.status).toBe(200);
    expect(firstPage.requests).toHaveLength(12);
    expect(secondPage.requests).toHaveLength(1);
    expect(firstPage.meta).toEqual({ page: 1, lastPage: 2, total: 13 });
    expect(secondPage.meta.page).toBe(2);
    const ids = firstPage.requests.map((request) => request.mcpRequestId);
    expect(ids).toEqual(ids.toSorted((a, b) => b - a));
    expect(first.text).not.toContain("requestBody");
    expect(first.text).not.toContain("responseBody");
  });
});

test("one request shows its full body and response and belongs to its agent only", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token, context } = await setup(db, pool);
    const other = await createAdminClient(context, "other-log@example.com");
    const otherToken = await issueToken(db, other.user.userId, "other");
    await callTool(admin.app, token, "get_owner", { username: "jane" });
    await callTool(admin.app, otherToken, "get_owner", { username: "bob" });
    const [mine] = await db
      .select()
      .from(mcpRequestsTable)
      .where(eq(mcpRequestsTable.clientId, "client-admin"));
    const headers = { cookie: admin.cookie };

    const found = await admin.app.request(
      `/api/agents/client-admin/requests/${mine?.mcpRequestId}`,
      { headers },
    );
    const wrongAgent = await admin.app.request(
      `/api/agents/client-other/requests/${mine?.mcpRequestId}`,
      { headers },
    );
    const missing = await admin.app.request(
      "/api/agents/client-admin/requests/999999",
      { headers },
    );

    expect(found.status).toBe(200);
    expect(
      z
        .object({
          request: z.object({
            requestBody: z.string(),
            responseBody: z.string(),
          }),
        })
        .parse(await found.json()).request.requestBody,
    ).toContain("jane");
    expect(wrongAgent.status).toBe(404);
    expect(missing.status).toBe(404);
  });
});

test("an unknown agent is a 404 for its page and its requests", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin } = await setup(db, pool);
    const headers = { cookie: admin.cookie };

    const page = await admin.app.request("/api/agents/nobody", { headers });
    const requests = await admin.app.request("/api/agents/nobody/requests", {
      headers,
    });
    const bad = await admin.app.request(
      "/api/agents/client-admin/requests?page=0",
      { headers },
    );

    expect(page.status).toBe(404);
    expect(requests.status).toBe(404);
    expect(bad.status).toBe(400);
  });
});

test("only admins can read an agent's page or requests", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, context, token } = await setup(db, pool);
    await callTool(admin.app, token, "get_owner", { username: "jane" });
    const member = await createAuthenticatedApp({
      context,
      email: "log-reader@example.com",
    });
    const headers = { cookie: member.cookie };

    for (const path of [
      "/api/agents/client-admin",
      "/api/agents/client-admin/requests",
      "/api/agents/client-admin/requests/1000",
    ]) {
      const response = await member.app.request(path, { headers });
      expect([path, response.status]).toEqual([path, 403]);
    }
  });
});

test("removing an agent also removes its recorded requests and no one else's", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token, context } = await setup(db, pool);
    const other = await createAdminClient(context, "other-remove@example.com");
    const otherToken = await issueToken(db, other.user.userId, "other");
    await callTool(admin.app, token, "get_owner", { username: "jane" });
    await callTool(admin.app, otherToken, "get_owner", { username: "bob" });

    const response = await admin.app.request("/api/agents/client-admin", {
      method: "DELETE",
      headers: { cookie: admin.cookie },
    });

    expect(response.status).toBe(204);
    const remaining = await db.select().from(mcpRequestsTable);
    expect(remaining.map((row) => row.clientId)).toEqual(["client-other"]);
  });
});

test("a huge body is clipped instead of stored whole, and a recording that fails never fails the call", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, context } = await setup(db, pool);
    const services = new Services({ context });

    await services.mcp.recordRequest({
      clientId: "client-admin",
      userId: admin.user.userId,
      requestBody: JSON.stringify({ method: "ping" }),
      responseBody: "x".repeat(150_000),
      statusCode: 200,
      durationMs: 1,
    });
    const [row] = await db.select().from(mcpRequestsTable);
    expect(row?.responseBody.length).toBeLessThan(101_000);
    expect(row?.responseBody).toContain("clipped");

    // The client does not exist, so the insert violates a constraint
    await services.mcp.recordRequest({
      clientId: "client-missing",
      userId: null,
      requestBody: "{}",
      responseBody: "{}",
      statusCode: 200,
      durationMs: 1,
    });
    expect(await db.$count(mcpRequestsTable)).toBe(1);
  });
});

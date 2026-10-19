import { expect, test } from "bun:test";
import z from "zod";
import { oauthAccessTokenTable } from "@server/infrastructure/database/schemas";
import { createAdminClient } from "./helpers/api";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";
import { issueToken, rpc, setup } from "./helpers/mcp";

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

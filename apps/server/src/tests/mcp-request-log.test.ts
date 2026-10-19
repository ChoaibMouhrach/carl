import { expect, test } from "bun:test";
import { asc, eq } from "drizzle-orm";
import z from "zod";
import {
  mcpRequestsTable,
  oauthApplicationTable,
  userTable,
} from "@server/infrastructure/database/schemas";
import { Services } from "@server/services";
import { callTool, issueToken, setup } from "./helpers/mcp";
import { createAdminClient } from "./helpers/api";
import { withTestDatabase } from "./helpers/http";

type Session = Awaited<ReturnType<typeof setup>>;

const post = (session: Session, body: string) =>
  session.admin.app.request("/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${session.token}`,
    },
    body,
  });

const rowsOf = (session: Session, clientId = "client-admin") =>
  session.context.repositories.db
    .select()
    .from(mcpRequestsTable)
    .where(eq(mcpRequestsTable.clientId, clientId))
    .orderBy(asc(mcpRequestsTable.mcpRequestId));

test("what is stored is exactly what crossed the wire, in both directions", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const sent = JSON.stringify({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "get_owner", arguments: { username: "jane" } },
    });

    const response = await post(session, sent);
    const received = await response.text();

    const [row] = await rowsOf(session);
    expect(row?.requestBody).toBe(sent);
    expect(row?.responseBody).toBe(received);
    expect(row).toMatchObject({
      statusCode: response.status,
      rpcMethod: "tools/call",
      toolName: "get_owner",
      isError: false,
      userId: session.admin.user.userId,
    });
    expect(row?.durationMs).toBeGreaterThanOrEqual(0);
  });
});

test("a protocol error is recorded as an error even though the call itself was answered", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);

    await post(
      session,
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/destroy" }),
    );

    const [row] = await rowsOf(session);
    expect(row).toMatchObject({ rpcMethod: "tools/destroy", isError: true });
    expect(row?.responseBody).toContain("error");
  });
});

test("a notification with no answer is recorded with an empty response and is not an error", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);

    const response = await post(
      session,
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    );

    const [row] = await rowsOf(session);
    expect(response.status).toBe(202);
    expect(row).toMatchObject({
      rpcMethod: "notifications/initialized",
      statusCode: 202,
      responseBody: "",
      isError: false,
    });
  });
});

test("a body that is not JSON is recorded as an unknown method and as an error", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);

    const response = await post(session, "{this is not json");

    const [row] = await rowsOf(session);
    expect(response.status).toBe(400);
    expect(row).toMatchObject({
      rpcMethod: "unknown",
      toolName: null,
      statusCode: 400,
      isError: true,
      requestBody: "{this is not json",
    });
  });
});

test("a batch of fifty requests is one row that lists every method", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const batch = Array.from({ length: 50 }, (_, index) => ({
      jsonrpc: "2.0",
      id: index + 1,
      method: "ping",
    }));

    await post(session, JSON.stringify(batch));

    const rows = await rowsOf(session);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.rpcMethod.split(", ")).toEqual(Array(50).fill("ping"));
  });
});

test("a body of exactly 100,000 characters is stored whole and one more is clipped with a note", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const services = new Services({ context: session.context });
    const record = (responseBody: string) =>
      services.mcp.recordRequest({
        clientId: "client-admin",
        userId: session.admin.user.userId,
        requestBody: "{}",
        responseBody,
        statusCode: 200,
        durationMs: 1,
      });

    await record("a".repeat(100_000));
    await record("b".repeat(100_001));

    const [whole, clipped] = await rowsOf(session);
    expect(whole?.responseBody).toBe("a".repeat(100_000));
    expect(clipped?.responseBody.startsWith("b".repeat(100_000))).toBe(true);
    expect(clipped?.responseBody).toContain("1 more characters");
  });
});

test("the access token is never stored in any recorded body", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);

    await callTool(session.admin.app, session.token, "get_owner", {
      username: "jane",
    });
    await post(
      session,
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    );

    const rows = await rowsOf(session);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.requestBody).not.toContain(session.token);
      expect(row.responseBody).not.toContain(session.token);
    }
  });
});

test("what an agent puts in a tool's arguments is stored as sent, so a write shows exactly what it wrote", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);

    await callTool(session.admin.app, session.token, "create_lead", {
      skoolUsername: "logged",
      name: "Logged",
      bio: "reach me at logged@example.com",
    });

    const [row] = await rowsOf(session);
    expect(row).toMatchObject({ toolName: "create_lead", isError: false });
    expect(row?.requestBody).toContain("logged@example.com");
  });
});

test("every call is kept, so the history grows with each one", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);

    for (let index = 0; index < 30; index += 1) {
      await callTool(session.admin.app, session.token, "get_owner", {
        username: `u${index}`,
      });
    }

    // There is no pruning, so this is the number of calls made; a retention limit would change it
    expect(await rowsOf(session)).toHaveLength(30);
  });
});

test("two agents keep separate histories", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const other = await createAdminClient(
      session.context,
      "second-agent@example.com",
    );
    const otherToken = await issueToken(db, other.user.userId, "second");

    await callTool(session.admin.app, session.token, "get_owner", {
      username: "mine",
    });
    await callTool(session.admin.app, otherToken, "get_owner", {
      username: "theirs",
    });
    await callTool(session.admin.app, otherToken, "get_owner", {
      username: "theirs-too",
    });

    const mine = await rowsOf(session, "client-admin");
    const theirs = await rowsOf(session, "client-second");
    expect(mine).toHaveLength(1);
    expect(mine[0]?.requestBody).toContain("mine");
    expect(theirs).toHaveLength(2);
    expect(theirs.every((row) => !row.requestBody.includes("mine"))).toBe(true);
  });
});

test("deleting the user keeps the history without a user, and deleting the OAuth client removes it", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const other = await createAdminClient(
      session.context,
      "to-delete@example.com",
    );
    const otherToken = await issueToken(db, other.user.userId, "gone");
    await callTool(session.admin.app, otherToken, "get_owner", {
      username: "x",
    });
    await callTool(session.admin.app, session.token, "get_owner", {
      username: "y",
    });

    await db.delete(userTable).where(eq(userTable.id, other.user.userId));
    const afterUser = await rowsOf(session, "client-gone");

    expect(afterUser).toHaveLength(1);
    expect(afterUser[0]?.userId).toBeNull();

    await db
      .delete(oauthApplicationTable)
      .where(eq(oauthApplicationTable.clientId, "client-gone"));

    expect(await rowsOf(session, "client-gone")).toEqual([]);
    expect(await rowsOf(session, "client-admin")).toHaveLength(1);
  });
});

test("the history shows a refused write as an error with the tool that was asked", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);

    await callTool(session.admin.app, session.token, "create_lead", {
      skoolUsername: "",
      name: "",
    });

    const [row] = await rowsOf(session);
    expect(row).toMatchObject({
      rpcMethod: "tools/call",
      toolName: "create_lead",
      isError: true,
    });
    expect(z.string().parse(row?.responseBody).length).toBeGreaterThan(0);
  });
});

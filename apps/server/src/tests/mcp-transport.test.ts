import { expect, test } from "bun:test";
import { asc } from "drizzle-orm";
import z from "zod";
import { mcpRequestsTable } from "@server/infrastructure/database/schemas";
import { withTestDatabase } from "./helpers/http";
import { setup } from "./helpers/mcp";

type Session = Awaited<ReturnType<typeof setup>>;

const send = (
  session: Session,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  session.admin.app.request("/api/mcp", {
    method: "POST",
    headers: {
      authorization: `Bearer ${session.token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify(body),
  });

const list = { jsonrpc: "2.0", id: 1, method: "tools/list" };
const initialize = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "test", version: "1" },
  },
};

const errorCode = async (response: Response) =>
  z
    .object({ error: z.object({ code: z.number(), message: z.string() }) })
    .parse(await response.json()).error;

for (const accept of [
  "application/json",
  "text/event-stream",
  "*/*",
  "application/json, text/event-stream",
]) {
  test(`a client that accepts ${accept} is answered`, async () => {
    await withTestDatabase(async ({ db, pool }) => {
      const session = await setup(db, pool);

      const response = await send(session, list, { accept });

      expect([accept, response.status]).toEqual([accept, 200]);
    });
  });
}

test("a client that sends no Accept header at all is answered", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);

    const response = await session.admin.app.request("/api/mcp", {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(list),
    });

    expect(response.status).toBe(200);
  });
});

test("a client that accepts only something else is refused, and the refusal is recorded as an error", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);

    const response = await send(session, list, { accept: "text/html" });

    expect(response.status).toBe(406);
    const [row] = await db.select().from(mcpRequestsTable);
    expect(row).toMatchObject({
      rpcMethod: "tools/list",
      statusCode: 406,
      isError: true,
    });
    expect(row?.responseBody).toContain("Not Acceptable");
  });
});

test("a body that is not sent as JSON is refused with 415 and recorded", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);

    const response = await send(session, list, {
      "content-type": "text/plain",
    });

    expect(response.status).toBe(415);
    expect((await errorCode(response)).message).toContain("Content-Type");
    const [row] = await db.select().from(mcpRequestsTable);
    expect(row).toMatchObject({ statusCode: 415, isError: true });
  });
});

test("a protocol version the server does not know is refused and names the ones it does", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);

    const response = await send(session, list, {
      "mcp-protocol-version": "1999-01-01",
    });

    expect(response.status).toBe(404);
    expect((await errorCode(response)).message).toContain("supported versions");
    const known = await send(session, list, {
      "mcp-protocol-version": "2025-03-26",
    });
    expect(known.status).toBe(200);
  });
});

test("there are no sessions: a made-up session id is ignored and every initialize works again", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);

    const first = await send(session, initialize);
    const second = await send(session, initialize);
    const withSession = await send(session, list, {
      "mcp-session-id": "not-a-session",
    });

    expect([first.status, second.status, withSession.status]).toEqual([
      200, 200, 200,
    ]);
    expect(first.headers.get("mcp-session-id")).toBeNull();
  });
});

test("an initialize sent together with other messages is refused and nothing else in the batch runs", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);

    const response = await send(session, [
      initialize,
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
    ]);

    expect(response.status).toBe(400);
    expect((await errorCode(response)).message).toContain("initialization");
    const rows = await db
      .select()
      .from(mcpRequestsTable)
      .orderBy(asc(mcpRequestsTable.mcpRequestId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ statusCode: 400, isError: true });
  });
});

test("a refused transport request gets a JSON-RPC error body, never the app's plain error shape", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);

    const response = await send(session, list, { accept: "text/html" });
    const body = z
      .object({
        jsonrpc: z.literal("2.0"),
        id: z.null(),
        error: z.object({ code: z.number() }),
      })
      .parse(await response.json());

    expect(body.error.code).toBeLessThan(0);
  });
});

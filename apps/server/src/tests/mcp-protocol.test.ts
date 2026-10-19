import { expect, test } from "bun:test";
import z from "zod";
import { withTestDatabase } from "./helpers/http";
import { callTool, rpc, setup } from "./helpers/mcp";

const post = (
  app: Awaited<ReturnType<typeof setup>>["admin"]["app"],
  token: string,
  body: string,
  accept = "application/json, text/event-stream",
) =>
  app.request("/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept,
      authorization: `Bearer ${token}`,
    },
    body,
  });

const errorBody = z.object({
  error: z.object({ code: z.number(), message: z.string() }),
});

test("initialize names the server and offers tools", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token } = await setup(db, pool);

    const response = await rpc(admin.app, token, "initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    });
    const body = z
      .object({
        result: z.object({
          serverInfo: z.object({ name: z.string() }),
          capabilities: z.object({ tools: z.object({}).passthrough() }),
        }),
      })
      .parse(await response.json());

    expect(response.status).toBe(200);
    expect(body.result.serverInfo.name).toBe("carl");
  });
});

for (const method of ["GET", "DELETE"] as const) {
  test(`a ${method} request is turned away without an error page`, async () => {
    await withTestDatabase(async ({ db, pool }) => {
      const { admin, token } = await setup(db, pool);

      const response = await admin.app.request("/api/mcp", {
        method,
        headers: {
          accept: "application/json, text/event-stream",
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });
  });
}

test("a batch of two requests gets two answers", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token } = await setup(db, pool);

    const response = await post(
      admin.app,
      token,
      JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        { jsonrpc: "2.0", id: 2, method: "ping" },
      ]),
    );
    const body = z
      .array(z.object({ id: z.number() }))
      .parse(await response.json());

    expect(body.map((item) => item.id).toSorted()).toEqual([1, 2]);
  });
});

test("broken JSON is a parse error, not a crash", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token } = await setup(db, pool);

    const response = await post(admin.app, token, "{not json");

    expect(response.status).toBe(400);
    expect(errorBody.parse(await response.json()).error.code).toBe(-32700);
  });
});

test("an unknown method is reported as such", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token } = await setup(db, pool);

    const response = await rpc(admin.app, token, "tools/destroy");

    expect(errorBody.parse(await response.json()).error.code).toBe(-32601);
  });
});

test("an unknown tool is an error and calls nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token, scraper } = await setup(db, pool);

    const response = await rpc(admin.app, token, "tools/call", {
      name: "delete_everything",
      arguments: {},
    });
    const text = await response.text();

    expect(text).toMatch(/not found|unknown|invalid/i);
    expect(scraper.discoverCalls).toEqual([]);
    expect(scraper.aboutCalls).toEqual([]);
  });
});

test("a tool call without arguments is refused as invalid input", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token, scraper } = await setup(db, pool);

    const response = await rpc(admin.app, token, "tools/call", {
      name: "search_communities",
    });

    expect(await response.text()).toMatch(/invalid|required/i);
    expect(scraper.discoverCalls).toEqual([]);
  });
});

test("a client that accepts only JSON is turned away with a client error", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token } = await setup(db, pool);

    const response = await post(
      admin.app,
      token,
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      "text/html",
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });
});

test("simultaneous calls from one agent each get their own answer", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, token } = await setup(db, pool);

    const results = await Promise.all(
      ["big-club", "small-club", "big-club", "small-club"].map((name) =>
        callTool(admin.app, token, "get_community", { name }),
      ),
    );

    expect(
      results.map(
        (result) =>
          z.object({ name: z.string() }).parse(JSON.parse(result.text)).name,
      ),
    ).toEqual(["big-club", "small-club", "big-club", "small-club"]);
  });
});

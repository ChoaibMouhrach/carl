import crypto from "crypto";
import { describe, expect, test } from "bun:test";
import type { Context } from "@server/context";
import { oauthAccessTokenTable } from "@server/infrastructure/database/schemas";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";

interface JsonRpcResponse<Result> {
  jsonrpc: "2.0";
  id: number;
  result?: Result;
  error?: { code: number; message: string };
}

const parseMcpResponse = async <Result>(
  response: Response,
): Promise<JsonRpcResponse<Result>> => {
  const contentType = response.headers.get("Content-Type") ?? "";

  if (contentType.includes("application/json")) {
    return (await response.json()) as JsonRpcResponse<Result>;
  }

  const body = await response.text();
  const line = body.split("\n").find((entry) => entry.startsWith("data: "));

  if (!line) {
    throw new Error(`No SSE data line found in MCP response: ${body}`);
  }

  return JSON.parse(line.slice("data: ".length)) as JsonRpcResponse<Result>;
};

const seedAccessToken = async (
  context: Context,
  userId: string,
): Promise<string> => {
  const accessToken = crypto.randomUUID();

  await context.repositories.db.insert(oauthAccessTokenTable).values({
    id: crypto.randomUUID(),
    accessToken,
    refreshToken: crypto.randomUUID(),
    accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    refreshTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    clientId: "test-oauth-client",
    userId,
    scopes: "openid",
  });

  return accessToken;
};

const mcpRequest = async (
  app: Awaited<ReturnType<typeof createAuthenticatedApp>>["app"],
  input: { token?: string; method: string; params?: unknown; id?: number },
) => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (input.token) headers["Authorization"] = `Bearer ${input.token}`;

  return await app.request("/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: input.id ?? 1,
      method: input.method,
      params: input.params,
    }),
  });
};

describe("POST /mcp", () => {
  test("a request with no bearer token gets a 401 with the correct WWW-Authenticate header", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "mcp-no-token@example.com",
      });

      const response = await mcpRequest(authenticated.app, {
        method: "tools/list",
      });

      expect(response.status).toBe(401);
      expect(response.headers.get("WWW-Authenticate")).toContain(
        "oauth-protected-resource",
      );
    });
  });

  test("list_clients returns only the token owner's clients", async () => {
    await withTestDatabase(async ({ context }) => {
      const owner = await createAuthenticatedApp({
        context,
        email: "mcp-owner@example.com",
      });
      const other = await createAuthenticatedApp({
        context,
        email: "mcp-other@example.com",
      });
      const ownerClient = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Owner's Client",
        userId: owner.user.userId,
      });
      await context.repositories.client.create({
        email: "other@example.com",
        name: "Other's Client",
        userId: other.user.userId,
      });

      const token = await seedAccessToken(context, owner.user.userId);
      const response = await mcpRequest(owner.app, {
        token,
        method: "tools/call",
        params: { name: "list_clients", arguments: {} },
      });
      const body = await parseMcpResponse<{
        content: { type: string; text: string }[];
      }>(response);

      expect(response.status).toBe(200);
      const clients = JSON.parse(body.result!.content[0]!.text) as {
        clientId: number;
        name: string;
      }[];
      expect(clients).toHaveLength(1);
      expect(clients[0]).toMatchObject({
        clientId: ownerClient.clientId,
        name: "Owner's Client",
      });
    });
  });

  test("search_documents is scoped to the token's userId, not a client-supplied one", async () => {
    await withTestDatabase(async ({ context }) => {
      const owner = await createAuthenticatedApp({
        context,
        email: "mcp-search-owner@example.com",
      });
      const intruder = await createAuthenticatedApp({
        context,
        email: "mcp-search-intruder@example.com",
      });
      const ownerClient = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Owner's Client",
        userId: owner.user.userId,
      });
      const file = await context.repositories.file.create({
        clientId: ownerClient.clientId,
        folderId: null,
        key: "some-key.txt",
        mimeType: "text/plain",
        name: "secret.txt",
        sizeBytes: 10,
        url: "https://storage.test/secret.txt",
        userId: owner.user.userId,
      });
      const { vectors } = await context.embeddings.embed({
        texts: ["confidential content"],
      });
      await context.repositories.chunk.createMany([
        {
          fileId: file.fileId,
          position: 0,
          content: "confidential content",
          embedding: vectors[0]!,
        },
      ]);

      // Positive case first: the owner's own token DOES find the chunk —
      // proves the wiring actually works, so the negative case below isn't
      // trivially true from search always returning nothing.
      const ownerToken = await seedAccessToken(context, owner.user.userId);
      const ownerResponse = await mcpRequest(owner.app, {
        token: ownerToken,
        method: "tools/call",
        params: {
          name: "search_documents",
          arguments: { clientId: ownerClient.clientId, query: "confidential" },
        },
      });
      const ownerBody = await parseMcpResponse<{
        content: { type: string; text: string }[];
      }>(ownerResponse);
      const ownerResults = JSON.parse(ownerBody.result!.content[0]!.text) as {
        content: string;
      }[];
      expect(ownerResults).toHaveLength(1);
      expect(ownerResults[0]?.content).toBe("confidential content");

      const intruderToken = await seedAccessToken(
        context,
        intruder.user.userId,
      );
      const response = await mcpRequest(intruder.app, {
        token: intruderToken,
        method: "tools/call",
        params: {
          name: "search_documents",
          arguments: { clientId: ownerClient.clientId, query: "confidential" },
        },
      });
      const body = await parseMcpResponse<{
        content: { type: string; text: string }[];
      }>(response);

      expect(response.status).toBe(200);
      const results = JSON.parse(body.result!.content[0]!.text) as unknown[];
      expect(results).toHaveLength(0);
    });
  });

  test("a request with a garbage bearer token that matches no row gets a 401", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "mcp-garbage-token@example.com",
      });

      const response = await mcpRequest(authenticated.app, {
        token: "this-token-does-not-exist-anywhere",
        method: "tools/list",
      });

      expect(response.status).toBe(401);
    });
  });

  test("a request with an expired access token gets a 401", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "mcp-expired-token@example.com",
      });

      const accessToken = crypto.randomUUID();
      await context.repositories.db.insert(oauthAccessTokenTable).values({
        id: crypto.randomUUID(),
        accessToken,
        refreshToken: crypto.randomUUID(),
        accessTokenExpiresAt: new Date(Date.now() - 60 * 60 * 1000),
        refreshTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        clientId: "test-oauth-client",
        userId: authenticated.user.userId,
        scopes: "openid",
      });

      const response = await mcpRequest(authenticated.app, {
        token: accessToken,
        method: "tools/list",
      });

      expect(response.status).toBe(401);
    });
  });

  test("authenticated tools/list includes both list_clients and search_documents with their input schemas", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "mcp-tools-list@example.com",
      });
      const token = await seedAccessToken(context, authenticated.user.userId);

      const response = await mcpRequest(authenticated.app, {
        token,
        method: "tools/list",
      });
      const body = await parseMcpResponse<{
        tools: { name: string; inputSchema: unknown }[];
      }>(response);

      expect(response.status).toBe(200);
      const names = body.result!.tools.map((tool) => tool.name).sort();
      expect(names).toEqual(["list_clients", "search_documents"]);

      const searchTool = body.result!.tools.find(
        (tool) => tool.name === "search_documents",
      );
      expect(searchTool?.inputSchema).toBeTruthy();
    });
  });

  test("search_documents rejects a call missing the required query argument", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "mcp-search-missing-query@example.com",
      });
      const client = await context.repositories.client.create({
        email: "acme@example.com",
        name: "Acme Corp",
        userId: authenticated.user.userId,
      });
      const token = await seedAccessToken(context, authenticated.user.userId);

      const response = await mcpRequest(authenticated.app, {
        token,
        method: "tools/call",
        params: {
          name: "search_documents",
          arguments: { clientId: client.clientId },
        },
      });
      const body = await parseMcpResponse<{
        content: { type: string; text: string }[];
      }>(response);

      expect((body.result as { isError?: boolean }).isError).toBe(true);
      const text = (
        body.result as { content: { type: string; text: string }[] }
      ).content[0]!.text;
      expect(text).toContain("Invalid arguments for tool search_documents");
      expect(text).toContain('"path": [\n      "query"\n    ]');
    });
  });

  test("search_documents returns nothing when the token owner queries a clientId they don't own at all", async () => {
    await withTestDatabase(async ({ context }) => {
      const owner = await createAuthenticatedApp({
        context,
        email: "mcp-search-unowned-owner@example.com",
      });
      const stranger = await createAuthenticatedApp({
        context,
        email: "mcp-search-unowned-stranger@example.com",
      });
      const strangerClient = await context.repositories.client.create({
        email: "stranger@example.com",
        name: "Stranger's Client",
        userId: stranger.user.userId,
      });
      const file = await context.repositories.file.create({
        clientId: strangerClient.clientId,
        folderId: null,
        key: "some-key.txt",
        mimeType: "text/plain",
        name: "secret.txt",
        sizeBytes: 10,
        url: "https://storage.test/secret.txt",
        userId: stranger.user.userId,
      });
      const { vectors } = await context.embeddings.embed({
        texts: ["stranger's confidential content"],
      });
      await context.repositories.chunk.createMany([
        {
          fileId: file.fileId,
          position: 0,
          content: "stranger's confidential content",
          embedding: vectors[0]!,
        },
      ]);

      const ownerToken = await seedAccessToken(context, owner.user.userId);
      const response = await mcpRequest(owner.app, {
        token: ownerToken,
        method: "tools/call",
        params: {
          name: "search_documents",
          arguments: {
            clientId: strangerClient.clientId,
            query: "confidential",
          },
        },
      });
      const body = await parseMcpResponse<{
        content: { type: string; text: string }[];
      }>(response);

      expect(response.status).toBe(200);
      const results = JSON.parse(body.result!.content[0]!.text) as unknown[];
      expect(results).toHaveLength(0);
    });
  });
});

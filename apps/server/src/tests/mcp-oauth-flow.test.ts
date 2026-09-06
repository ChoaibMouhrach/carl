import crypto from "crypto";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "bun:test";
import type { App } from "@server/app";
import { initENV } from "@server/config/env";
import {
  oauthAccessTokenTable,
  verificationTable,
} from "@server/infrastructure/database/schemas";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";

interface RegisterResponse {
  client_id: string;
  client_secret?: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope: string;
}

interface JsonRpcResponse<Result> {
  jsonrpc: "2.0";
  id: number;
  result?: Result;
  error?: { code: number; message: string };
}

const REDIRECT_URI = "https://mcp-client.example/callback";

const base64url = (input: Buffer) =>
  input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const createPkcePair = () => {
  const codeVerifier = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(
    crypto.createHash("sha256").update(codeVerifier).digest(),
  );
  return { codeVerifier, codeChallenge };
};

const registerClient = async (
  app: App,
  input: {
    tokenEndpointAuthMethod?: "none" | "client_secret_basic";
    redirectUris?: string[];
  },
): Promise<Response> =>
  await app.request("/api/auth/mcp/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Test MCP Client",
      redirect_uris: input.redirectUris ?? [REDIRECT_URI],
      token_endpoint_auth_method: input.tokenEndpointAuthMethod ?? "none",
    }),
  });

const authorize = async (
  app: App,
  cookie: string | null,
  params: Record<string, string>,
): Promise<Response> => {
  const query = new URLSearchParams(params).toString();
  return await app.request(`/api/auth/mcp/authorize?${query}`, {
    headers: cookie ? { Cookie: cookie } : {},
    redirect: "manual",
  });
};

const extractRedirectCode = (
  response: Response,
): { code: string; state: string | null } => {
  const location = response.headers.get("Location");
  if (!location) {
    throw new Error(`No Location header on redirect: ${response.status}`);
  }
  const url = new URL(location);
  const code = url.searchParams.get("code");
  if (!code) {
    throw new Error(`No code in redirect location: ${location}`);
  }
  return { code, state: url.searchParams.get("state") };
};

const exchangeToken = async (
  app: App,
  body: Record<string, string | undefined>,
): Promise<Response> =>
  await app.request("/api/auth/mcp/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

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

const mcpToolsList = async (app: App, accessToken: string) =>
  await app.request("/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });

describe("MCP OAuth flow (real client registration, authorize, and token exchange)", () => {
  test("registers a public client, completes the full authorize+token dance with PKCE, and the real access token authenticates MCP tool calls", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "mcp-oauth-public@example.com",
      });
      const registerResponse = await registerClient(authenticated.app, {
        tokenEndpointAuthMethod: "none",
      });
      expect(registerResponse.status).toBe(201);
      const client = (await registerResponse.json()) as RegisterResponse;
      expect(client.client_secret).toBeUndefined();

      const { codeVerifier, codeChallenge } = createPkcePair();
      const authorizeResponse = await authorize(
        authenticated.app,
        authenticated.cookie,
        {
          response_type: "code",
          client_id: client.client_id,
          redirect_uri: REDIRECT_URI,
          scope: "openid",
          state: "state-123",
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
        },
      );
      expect(authorizeResponse.status).toBe(302);
      const { code, state } = extractRedirectCode(authorizeResponse);
      expect(state).toBe("state-123");

      const tokenResponse = await exchangeToken(authenticated.app, {
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: client.client_id,
        code_verifier: codeVerifier,
      });
      expect(tokenResponse.status).toBe(200);
      const token = (await tokenResponse.json()) as TokenResponse;
      expect(token.access_token).toBeTruthy();
      expect(token.refresh_token).toBeUndefined();

      const toolsResponse = await mcpToolsList(
        authenticated.app,
        token.access_token,
      );
      const toolsBody = await parseMcpResponse<{
        tools: { name: string }[];
      }>(toolsResponse);
      expect(toolsResponse.status).toBe(200);
      const names = toolsBody.result!.tools.map((tool) => tool.name).sort();
      expect(names).toEqual(["list_clients", "search_documents"]);
    });
  });

  test("registers a confidential client and completes token exchange with client_secret_basic", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "mcp-oauth-confidential@example.com",
      });
      const registerResponse = await registerClient(authenticated.app, {
        tokenEndpointAuthMethod: "client_secret_basic",
      });
      expect(registerResponse.status).toBe(201);
      const client = (await registerResponse.json()) as RegisterResponse;
      expect(client.client_secret).toBeTruthy();

      const { codeVerifier, codeChallenge } = createPkcePair();
      const authorizeResponse = await authorize(
        authenticated.app,
        authenticated.cookie,
        {
          response_type: "code",
          client_id: client.client_id,
          redirect_uri: REDIRECT_URI,
          scope: "openid",
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
        },
      );
      const { code } = extractRedirectCode(authorizeResponse);

      const tokenResponse = await authenticated.app.request(
        "/api/auth/mcp/token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${Buffer.from(`${client.client_id}:${client.client_secret}`).toString("base64")}`,
          },
          body: JSON.stringify({
            grant_type: "authorization_code",
            code,
            redirect_uri: REDIRECT_URI,
            code_verifier: codeVerifier,
          }),
        },
      );
      expect(tokenResponse.status).toBe(200);
      const token = (await tokenResponse.json()) as TokenResponse;
      expect(token.access_token).toBeTruthy();
    });
  });

  test("issues a refresh token when offline_access scope is requested, and the refresh token grant issues a new working access token", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "mcp-oauth-refresh@example.com",
      });
      const registerResponse = await registerClient(authenticated.app, {});
      const client = (await registerResponse.json()) as RegisterResponse;
      const { codeVerifier, codeChallenge } = createPkcePair();

      const authorizeResponse = await authorize(
        authenticated.app,
        authenticated.cookie,
        {
          response_type: "code",
          client_id: client.client_id,
          redirect_uri: REDIRECT_URI,
          scope: "openid offline_access",
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
        },
      );
      const { code } = extractRedirectCode(authorizeResponse);

      const tokenResponse = await exchangeToken(authenticated.app, {
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: client.client_id,
        code_verifier: codeVerifier,
      });
      const token = (await tokenResponse.json()) as TokenResponse;
      expect(token.refresh_token).toBeTruthy();

      const refreshResponse = await exchangeToken(authenticated.app, {
        grant_type: "refresh_token",
        refresh_token: token.refresh_token,
        client_id: client.client_id,
      });
      expect(refreshResponse.status).toBe(200);
      const refreshed = (await refreshResponse.json()) as TokenResponse;
      expect(refreshed.access_token).toBeTruthy();
      expect(refreshed.access_token).not.toBe(token.access_token);

      const toolsResponse = await mcpToolsList(
        authenticated.app,
        refreshed.access_token,
      );
      expect(toolsResponse.status).toBe(200);
    });
  });

  test("rejects registering a client with no redirect_uris when the grant type is authorization_code", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "mcp-oauth-register-no-redirect@example.com",
      });

      const response = await authenticated.app.request(
        "/api/auth/mcp/register",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_name: "Bad Client",
            redirect_uris: [],
            token_endpoint_auth_method: "none",
          }),
        },
      );

      expect(response.status).toBe(400);
    });
  });

  test("redirects an unauthenticated authorize request to the configured login page", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "mcp-oauth-unauthenticated@example.com",
      });
      const registerResponse = await registerClient(authenticated.app, {});
      const client = (await registerResponse.json()) as RegisterResponse;
      const { codeChallenge } = createPkcePair();

      const response = await authorize(authenticated.app, null, {
        response_type: "code",
        client_id: client.client_id,
        redirect_uri: REDIRECT_URI,
        scope: "openid",
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      });

      expect(response.status).toBe(302);
      const location = response.headers.get("Location")!;
      const env = initENV();
      expect(location.startsWith(`${env.CLIENT_URL}/app/sign-in`)).toBe(true);
    });
  });

  test("rejects an authorize request whose redirect_uri was never registered for that client", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "mcp-oauth-bad-redirect@example.com",
      });
      const registerResponse = await registerClient(authenticated.app, {});
      const client = (await registerResponse.json()) as RegisterResponse;
      const { codeChallenge } = createPkcePair();

      const response = await authorize(
        authenticated.app,
        authenticated.cookie,
        {
          response_type: "code",
          client_id: client.client_id,
          redirect_uri: "https://not-the-registered-uri.example/callback",
          scope: "openid",
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
        },
      );

      expect(response.status).toBe(400);
    });
  });

  test("redirects to the error page for an authorize request naming an unknown client_id", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "mcp-oauth-unknown-client@example.com",
      });
      const { codeChallenge } = createPkcePair();

      const response = await authorize(
        authenticated.app,
        authenticated.cookie,
        {
          response_type: "code",
          client_id: "does-not-exist",
          redirect_uri: REDIRECT_URI,
          scope: "openid",
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
        },
      );

      expect(response.status).toBe(302);
      const location = response.headers.get("Location")!;
      expect(location).toContain("/error");
      expect(location).toContain("error=invalid_client");
    });
  });

  test("redirects back to the client's redirect_uri with an invalid_scope error for a scope the client didn't register", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "mcp-oauth-bad-scope@example.com",
      });
      const registerResponse = await registerClient(authenticated.app, {});
      const client = (await registerResponse.json()) as RegisterResponse;
      const { codeChallenge } = createPkcePair();

      const response = await authorize(
        authenticated.app,
        authenticated.cookie,
        {
          response_type: "code",
          client_id: client.client_id,
          redirect_uri: REDIRECT_URI,
          scope: "not-a-real-scope",
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
        },
      );

      expect(response.status).toBe(302);
      const location = new URL(response.headers.get("Location")!);
      expect(location.origin + location.pathname).toBe(REDIRECT_URI);
      expect(location.searchParams.get("error")).toBe("invalid_scope");
    });
  });

  test("rejects a token exchange whose PKCE code_verifier doesn't match the original code_challenge", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "mcp-oauth-pkce-mismatch@example.com",
      });
      const registerResponse = await registerClient(authenticated.app, {});
      const client = (await registerResponse.json()) as RegisterResponse;
      const { codeChallenge } = createPkcePair();

      const authorizeResponse = await authorize(
        authenticated.app,
        authenticated.cookie,
        {
          response_type: "code",
          client_id: client.client_id,
          redirect_uri: REDIRECT_URI,
          scope: "openid",
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
        },
      );
      const { code } = extractRedirectCode(authorizeResponse);

      const tokenResponse = await exchangeToken(authenticated.app, {
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: client.client_id,
        code_verifier: "this-does-not-match-the-original-challenge",
      });

      expect(tokenResponse.status).toBe(401);
    });
  });

  test("rejects a public client's token exchange with no code_verifier at all", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "mcp-oauth-no-verifier@example.com",
      });
      const registerResponse = await registerClient(authenticated.app, {});
      const client = (await registerResponse.json()) as RegisterResponse;

      // No code_challenge on the authorize call: this isolates the
      // public-client-specific "code verifier is required" rule from the
      // separate, unconditional "PKCE was started but not finished" check
      // that would otherwise catch a missing verifier first.
      const authorizeResponse = await authorize(
        authenticated.app,
        authenticated.cookie,
        {
          response_type: "code",
          client_id: client.client_id,
          redirect_uri: REDIRECT_URI,
          scope: "openid",
        },
      );
      const { code } = extractRedirectCode(authorizeResponse);

      const tokenResponse = await exchangeToken(authenticated.app, {
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: client.client_id,
      });

      expect(tokenResponse.status).toBe(400);
    });
  });

  test("rejects reusing the same authorization code a second time", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "mcp-oauth-reuse-code@example.com",
      });
      const registerResponse = await registerClient(authenticated.app, {});
      const client = (await registerResponse.json()) as RegisterResponse;
      const { codeVerifier, codeChallenge } = createPkcePair();

      const authorizeResponse = await authorize(
        authenticated.app,
        authenticated.cookie,
        {
          response_type: "code",
          client_id: client.client_id,
          redirect_uri: REDIRECT_URI,
          scope: "openid",
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
        },
      );
      const { code } = extractRedirectCode(authorizeResponse);

      const tokenBody = {
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: client.client_id,
        code_verifier: codeVerifier,
      };
      const firstResponse = await exchangeToken(authenticated.app, tokenBody);
      expect(firstResponse.status).toBe(200);

      const secondResponse = await exchangeToken(authenticated.app, tokenBody);
      expect(secondResponse.status).toBe(401);
    });
  });

  test("rejects a token exchange using an expired authorization code", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "mcp-oauth-expired-code@example.com",
      });
      const registerResponse = await registerClient(authenticated.app, {});
      const client = (await registerResponse.json()) as RegisterResponse;
      const { codeVerifier, codeChallenge } = createPkcePair();

      const authorizeResponse = await authorize(
        authenticated.app,
        authenticated.cookie,
        {
          response_type: "code",
          client_id: client.client_id,
          redirect_uri: REDIRECT_URI,
          scope: "openid",
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
        },
      );
      const { code } = extractRedirectCode(authorizeResponse);

      await context.repositories.db
        .update(verificationTable)
        .set({ expiresAt: new Date(Date.now() - 60 * 1000) })
        .where(eq(verificationTable.identifier, code));

      const tokenResponse = await exchangeToken(authenticated.app, {
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: client.client_id,
        code_verifier: codeVerifier,
      });

      expect(tokenResponse.status).toBe(401);
    });
  });

  test("rejects a token exchange with a redirect_uri that doesn't match the one from the authorize step", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "mcp-oauth-redirect-mismatch@example.com",
      });
      const registerResponse = await registerClient(authenticated.app, {
        redirectUris: [REDIRECT_URI, "https://mcp-client.example/other"],
      });
      const client = (await registerResponse.json()) as RegisterResponse;
      const { codeVerifier, codeChallenge } = createPkcePair();

      const authorizeResponse = await authorize(
        authenticated.app,
        authenticated.cookie,
        {
          response_type: "code",
          client_id: client.client_id,
          redirect_uri: REDIRECT_URI,
          scope: "openid",
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
        },
      );
      const { code } = extractRedirectCode(authorizeResponse);

      const tokenResponse = await exchangeToken(authenticated.app, {
        grant_type: "authorization_code",
        code,
        redirect_uri: "https://mcp-client.example/other",
        client_id: client.client_id,
        code_verifier: codeVerifier,
      });

      expect(tokenResponse.status).toBe(401);
    });
  });

  test("rejects a refresh_token grant carrying a different client_id than the one that issued it", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "mcp-oauth-refresh-wrong-client@example.com",
      });
      const registerResponse = await registerClient(authenticated.app, {});
      const client = (await registerResponse.json()) as RegisterResponse;
      const otherRegisterResponse = await registerClient(authenticated.app, {
        redirectUris: ["https://other-client.example/callback"],
      });
      const otherClient =
        (await otherRegisterResponse.json()) as RegisterResponse;
      const { codeVerifier, codeChallenge } = createPkcePair();

      const authorizeResponse = await authorize(
        authenticated.app,
        authenticated.cookie,
        {
          response_type: "code",
          client_id: client.client_id,
          redirect_uri: REDIRECT_URI,
          scope: "openid offline_access",
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
        },
      );
      const { code } = extractRedirectCode(authorizeResponse);

      const tokenResponse = await exchangeToken(authenticated.app, {
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: client.client_id,
        code_verifier: codeVerifier,
      });
      const token = (await tokenResponse.json()) as TokenResponse;

      const refreshResponse = await exchangeToken(authenticated.app, {
        grant_type: "refresh_token",
        refresh_token: token.refresh_token,
        client_id: otherClient.client_id,
      });

      expect(refreshResponse.status).toBe(401);
    });
  });

  test("rejects a refresh_token grant for a token that never requested the offline_access scope", async () => {
    await withTestDatabase(async ({ context }) => {
      const authenticated = await createAuthenticatedApp({
        context,
        email: "mcp-oauth-refresh-no-offline@example.com",
      });
      const registerResponse = await registerClient(authenticated.app, {});
      const client = (await registerResponse.json()) as RegisterResponse;
      const { codeVerifier, codeChallenge } = createPkcePair();

      const authorizeResponse = await authorize(
        authenticated.app,
        authenticated.cookie,
        {
          response_type: "code",
          client_id: client.client_id,
          redirect_uri: REDIRECT_URI,
          scope: "openid",
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
        },
      );
      const { code } = extractRedirectCode(authorizeResponse);

      const tokenResponse = await exchangeToken(authenticated.app, {
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: client.client_id,
        code_verifier: codeVerifier,
      });
      const token = (await tokenResponse.json()) as TokenResponse;
      expect(token.refresh_token).toBeUndefined();

      // The server still stores a refresh token column even when it isn't
      // returned to the caller (scope lacked offline_access) — fetch it
      // directly to prove the *stored* token is unusable for refresh, not
      // just that the API withheld it.
      const [row] = await context.repositories.db
        .select({ refreshToken: oauthAccessTokenTable.refreshToken })
        .from(oauthAccessTokenTable)
        .where(eq(oauthAccessTokenTable.accessToken, token.access_token));

      const refreshResponse = await exchangeToken(authenticated.app, {
        grant_type: "refresh_token",
        refresh_token: row!.refreshToken,
        client_id: client.client_id,
      });

      expect(refreshResponse.status).toBe(401);
    });
  });
});

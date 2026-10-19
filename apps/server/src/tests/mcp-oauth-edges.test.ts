import { createHash } from "node:crypto";
import { expect, test } from "bun:test";
import z from "zod";
import {
  oauthAccessTokenTable,
  oauthApplicationTable,
  verificationTable,
} from "@server/infrastructure/database/schemas";
import { withTestDatabase } from "./helpers/http";
import { rpc, setup } from "./helpers/mcp";

const REDIRECT = "http://localhost:8123/callback";
const verifier = "v".repeat(64);
const challenge = createHash("sha256").update(verifier).digest("base64url");

type App = Awaited<ReturnType<typeof setup>>["admin"]["app"];

const register = (app: App, body: object) =>
  app.request("/api/auth/mcp/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const registered = async (app: App) => {
  const response = await register(app, {
    redirect_uris: [REDIRECT],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    client_name: "Edge agent",
  });

  return z.object({ client_id: z.string() }).parse(await response.json())
    .client_id;
};

const authorize = async (app: App, cookie: string, clientId: string) => {
  const response = await app.request(
    `/api/auth/mcp/authorize?${new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT,
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
      scope: "openid offline_access",
      state: "s",
    })}`,
    { headers: { cookie }, redirect: "manual" },
  );

  return (
    new URL(response.headers.get("location") ?? "").searchParams.get("code") ??
    ""
  );
};

const exchange = (app: App, form: Record<string, string>) =>
  app.request("/api/auth/mcp/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
  });

const codeForm = (
  clientId: string,
  code: string,
  extra: Record<string, string> = {},
) => ({
  grant_type: "authorization_code",
  code,
  redirect_uri: REDIRECT,
  client_id: clientId,
  code_verifier: verifier,
  ...extra,
});

test("registering a client without any redirect address is refused and adds no client", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin } = await setup(db, pool);
    const before = await db.$count(oauthApplicationTable);

    const response = await register(admin.app, {
      client_name: "No redirect",
      token_endpoint_auth_method: "none",
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await db.$count(oauthApplicationTable)).toBe(before);
  });
});

test("a code cannot be exchanged for a different redirect address", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin } = await setup(db, pool);
    const clientId = await registered(admin.app);
    const code = await authorize(admin.app, admin.cookie, clientId);

    const response = await exchange(
      admin.app,
      codeForm(clientId, code, { redirect_uri: "http://evil.example.com/cb" }),
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await db.$count(oauthAccessTokenTable)).toBe(1);
  });
});

test("a code cannot be exchanged by a different client", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin } = await setup(db, pool);
    const owner = await registered(admin.app);
    const thief = await registered(admin.app);
    const code = await authorize(admin.app, admin.cookie, owner);

    const response = await exchange(admin.app, codeForm(thief, code));

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await db.$count(oauthAccessTokenTable)).toBe(1);
  });
});

test("a code that has expired is refused", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin } = await setup(db, pool);
    const clientId = await registered(admin.app);
    const code = await authorize(admin.app, admin.cookie, clientId);
    await db
      .update(verificationTable)
      .set({ expiresAt: new Date(Date.now() - 1_000) });

    const response = await exchange(admin.app, codeForm(clientId, code));

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await db.$count(oauthAccessTokenTable)).toBe(1);
  });
});

test("a refresh token past its own expiry is refused", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin } = await setup(db, pool);
    const clientId = await registered(admin.app);
    const code = await authorize(admin.app, admin.cookie, clientId);
    const tokens = z
      .object({ refresh_token: z.string() })
      .parse(
        await (await exchange(admin.app, codeForm(clientId, code))).json(),
      );
    await db
      .update(oauthAccessTokenTable)
      .set({ refreshTokenExpiresAt: new Date(Date.now() - 1_000) });

    const response = await exchange(admin.app, {
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: clientId,
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});

test("an access token from one client is not accepted for a client that was never authorized", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin } = await setup(db, pool);
    const clientId = await registered(admin.app);
    const code = await authorize(admin.app, admin.cookie, clientId);
    const tokens = z
      .object({ access_token: z.string() })
      .parse(
        await (await exchange(admin.app, codeForm(clientId, code))).json(),
      );

    const ok = await rpc(admin.app, tokens.access_token, "tools/list");
    const altered = await rpc(
      admin.app,
      `${tokens.access_token}x`,
      "tools/list",
    );

    expect([ok.status, altered.status]).toEqual([200, 401]);
  });
});

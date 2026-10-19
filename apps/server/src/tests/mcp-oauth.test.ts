import { createHash } from "node:crypto";
import { expect, test } from "bun:test";
import z from "zod";
import { initENV } from "@server/config/env";
import {
  oauthAccessTokenTable,
  oauthApplicationTable,
} from "@server/infrastructure/database/schemas";
import { withTestDatabase } from "./helpers/http";
import { rpc, setup } from "./helpers/mcp";

const REDIRECT = "http://localhost:8123/callback";
const verifier = "v".repeat(64);
const challenge = createHash("sha256").update(verifier).digest("base64url");

type App = Awaited<ReturnType<typeof setup>>["admin"]["app"];

const register = async (app: App, redirect = REDIRECT) => {
  const response = await app.request("/api/auth/mcp/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      redirect_uris: [redirect],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_name: "Test agent",
    }),
  });
  expect(response.status).toBeLessThan(300);

  return z.object({ client_id: z.string() }).parse(await response.json())
    .client_id;
};

const authorize = (
  app: App,
  clientId: string,
  options: { cookie?: string; redirect?: string; state?: string } = {},
) => {
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: options.redirect ?? REDIRECT,
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    scope: "openid offline_access",
    state: options.state ?? "state-1",
  });

  return app.request(`/api/auth/mcp/authorize?${query}`, {
    headers: options.cookie ? { cookie: options.cookie } : {},
    redirect: "manual",
  });
};

const exchange = (
  app: App,
  input: {
    clientId: string;
    code: string;
    verifier?: string;
    redirect?: string;
  },
) =>
  app.request("/api/auth/mcp/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirect ?? REDIRECT,
      client_id: input.clientId,
      code_verifier: input.verifier ?? verifier,
    }),
  });

const codeFrom = (response: Response) => {
  const location = response.headers.get("location");
  expect(location).not.toBeNull();
  const url = new URL(location ?? "");

  return {
    code: url.searchParams.get("code"),
    state: url.searchParams.get("state"),
    url,
  };
};

const tokenBody = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  token_type: z.string(),
});

test("a signed-in admin's agent registers, is authorized, trades the code for a token and uses the tool", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin } = await setup(db, pool);
    const clientId = await register(admin.app);

    const authorized = await authorize(admin.app, clientId, {
      cookie: admin.cookie,
    });
    const { code, state, url } = codeFrom(authorized);

    expect(authorized.status).toBe(302);
    expect(url.origin + url.pathname).toBe(REDIRECT);
    expect(state).toBe("state-1");
    expect(code).toBeTruthy();

    const exchanged = await exchange(admin.app, { clientId, code: code ?? "" });
    expect(exchanged.status).toBe(200);
    const tokens = tokenBody.parse(await exchanged.json());

    const stored = await db.select().from(oauthAccessTokenTable);
    const issued = stored.find(
      (row) => row.accessToken === tokens.access_token,
    );
    expect(issued).toMatchObject({ clientId, userId: admin.user.userId });
    expect(await db.$count(oauthApplicationTable)).toBe(2);

    const listed = await rpc(admin.app, tokens.access_token, "tools/list");
    expect(listed.status).toBe(200);
  });
});

test("a signed-out visitor is sent to the sign-in page with the request kept", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin } = await setup(db, pool);
    const clientId = await register(admin.app);

    const response = await authorize(admin.app, clientId);

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(
      `${new URL(initENV().CLIENT_URL).origin}/sign-in`,
    );
    expect(location.searchParams.get("client_id")).toBe(clientId);
    expect(response.headers.get("set-cookie")).toContain("oidc_login_prompt");
  });
});

test("signing in with the request kept resumes the authorization and hands back a code", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin } = await setup(db, pool);
    const clientId = await register(admin.app);
    const signedOut = await authorize(admin.app, clientId);
    const promptCookie =
      (signedOut.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

    const signIn = await admin.app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: promptCookie },
      body: JSON.stringify({
        email: admin.user.email,
        password: "password-that-is-long-enough",
      }),
    });
    const body = z
      .object({ redirect: z.boolean(), url: z.string() })
      .parse(await signIn.json());
    const target = new URL(body.url);

    expect(signIn.status).toBe(200);
    expect(body.redirect).toBe(true);
    expect(signIn.headers.get("location")).toBeNull();
    expect(signIn.headers.get("set-cookie")).toContain(
      "better-auth.session_token",
    );

    expect(target.origin + target.pathname).toBe(REDIRECT);
    expect(target.searchParams.get("code")).toBeTruthy();
    expect(target.searchParams.get("state")).toBe("state-1");
  });
});

test("a redirect address that was not registered is refused and nothing is issued", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin } = await setup(db, pool);
    const clientId = await register(admin.app);

    const response = await authorize(admin.app, clientId, {
      cookie: admin.cookie,
      redirect: "http://evil.example.com/steal",
    });

    expect(response.headers.get("location") ?? "").not.toContain(
      "evil.example.com/steal?code",
    );
    expect(await db.$count(oauthAccessTokenTable)).toBe(1);
  });
});

test("a wrong PKCE verifier is refused and issues no token", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin } = await setup(db, pool);
    const clientId = await register(admin.app);
    const { code } = codeFrom(
      await authorize(admin.app, clientId, { cookie: admin.cookie }),
    );

    const response = await exchange(admin.app, {
      clientId,
      code: code ?? "",
      verifier: "w".repeat(64),
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await db.$count(oauthAccessTokenTable)).toBe(1);
  });
});

test("an authorization code works once", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin } = await setup(db, pool);
    const clientId = await register(admin.app);
    const { code } = codeFrom(
      await authorize(admin.app, clientId, { cookie: admin.cookie }),
    );

    const first = await exchange(admin.app, { clientId, code: code ?? "" });
    const second = await exchange(admin.app, { clientId, code: code ?? "" });

    expect(first.status).toBe(200);
    expect(second.status).toBeGreaterThanOrEqual(400);
    expect(await db.$count(oauthAccessTokenTable)).toBe(2);
  });
});

test("the refresh token gives a working new access token", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin } = await setup(db, pool);
    const clientId = await register(admin.app);
    const { code } = codeFrom(
      await authorize(admin.app, clientId, { cookie: admin.cookie }),
    );
    const tokens = tokenBody.parse(
      await (await exchange(admin.app, { clientId, code: code ?? "" })).json(),
    );

    const refreshed = await admin.app.request("/api/auth/mcp/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
        client_id: clientId,
      }),
    });

    expect(refreshed.status).toBe(200);
    const next = tokenBody.parse(await refreshed.json());
    expect((await rpc(admin.app, next.access_token, "tools/list")).status).toBe(
      200,
    );
  });
});

test("an agent signed in by a non-admin gets a token that the tools refuse", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await setup(db, pool);
    const { createAuthenticatedApp } = await import("./helpers/http");
    const member = await createAuthenticatedApp({
      context,
      email: "oauth-member@example.com",
    });
    const clientId = await register(admin.app);
    const { code } = codeFrom(
      await authorize(admin.app, clientId, { cookie: member.cookie }),
    );
    const tokens = tokenBody.parse(
      await (await exchange(admin.app, { clientId, code: code ?? "" })).json(),
    );

    const response = await rpc(admin.app, tokens.access_token, "tools/list");

    expect(response.status).toBe(403);
  });
});

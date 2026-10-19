import { test, expect } from "../fixtures";
import { API_URL } from "../config";
import {
  accessTokenOf,
  AGENT_CALLBACK,
  startAgentCallback,
  connectViaApi,
  exchangeCode,
  field,
  mcp,
  readCallback,
  refreshWith,
  registerAgent,
} from "./mcp-support";
import { token } from "./support";
import type { Page } from "@playwright/test";

const signInForm = async (page: Page, email: string, password: string) => {
  await page.getByLabel("Email address").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
};

const agentCard = (page: Page, name: string) =>
  page
    .locator('[data-slot="card"] [data-slot="card"]')
    .filter({ hasText: name });

test("a client that is given only the address on the card can find everything else and connect", async ({
  page,
  request,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  await page.goto("/admin/account");
  const address = await page.getByLabel("MCP server address").inputValue();

  const challenge = await request.post(address, {
    data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    headers: { accept: "application/json, text/event-stream" },
  });
  expect(challenge.status()).toBe(401);
  const header = challenge.headers()["www-authenticate"] ?? "";
  const metadataUrl = /resource_metadata="([^"]+)"/.exec(header)?.[1];
  expect(metadataUrl).toBeTruthy();

  const resource = await (await request.get(metadataUrl ?? "")).json();
  expect(field(resource, "resource")).toBe(address);
  const issuers = field(resource, "authorization_servers");
  expect(Array.isArray(issuers)).toBe(true);

  const issuer = String(Array.isArray(issuers) ? issuers[0] : "");
  const metadata = await (
    await request.get(`${issuer}/.well-known/oauth-authorization-server`)
  ).json();
  for (const key of [
    "authorization_endpoint",
    "token_endpoint",
    "registration_endpoint",
  ]) {
    expect(String(field(metadata, key))).toMatch(/^https?:\/\//);
  }

  // The endpoints the metadata advertises are the ones the flow uses
  expect(String(field(metadata, "registration_endpoint"))).toBe(
    `${API_URL}/api/auth/mcp/register`,
  );
  expect(String(field(metadata, "token_endpoint"))).toBe(
    `${API_URL}/api/auth/mcp/token`,
  );
  expect(String(field(metadata, "authorization_endpoint"))).toBe(
    `${API_URL}/api/auth/mcp/authorize`,
  );

  const connected = await connectViaApi(page.context().request);
  expect(
    (await mcp(request, connected.accessToken, "tools/list")).status(),
  ).toBe(200);
});

test("reloading the sign-in page in the middle of an agent request keeps the request", async ({
  page,
  request,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await startAgentCallback();
  const agent = await registerAgent(request);

  await page.goto(agent.authorizeUrl("state-reload"));
  await expect(page).toHaveURL(/\/sign-in\?.*client_id=/);
  await page.reload();
  await signInForm(page, admin.email, admin.password);

  await expect(page).toHaveURL(new RegExp(`^${AGENT_CALLBACK}\\?code=`));
  expect(readCallback(page).state).toBe("state-reload");
});

test("a state value full of special characters comes back unchanged", async ({
  page,
  request,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  await startAgentCallback();
  const agent = await registerAgent(request);
  const state = "a b&c=d/é?x#y%20z+1";

  await page.goto(agent.authorizeUrl(state));

  await expect(page).toHaveURL(new RegExp(`^${AGENT_CALLBACK}\\?code=`));
  expect(readCallback(page).state).toBe(state);
  expect(await seed.listOAuthTokens(admin.email)).toEqual([]);
});

test("a redirect address the agent never registered gets no code and no token", async ({
  page,
  request,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const agent = await registerAgent(request);
  const reached: string[] = [];
  await page.route("http://evil.example.com/**", async (route) => {
    reached.push(route.request().url());
    await route.fulfill({ status: 200, body: "evil" });
  });

  const url = agent
    .authorizeUrl("state-evil")
    .replace(
      encodeURIComponent(AGENT_CALLBACK),
      encodeURIComponent("http://evil.example.com/steal"),
    );
  await page.goto(url).catch(() => undefined);

  expect(reached.filter((item) => item.includes("code="))).toEqual([]);
  expect(page.url()).not.toContain("code=");
  expect(await seed.listOAuthTokens(admin.email)).toEqual([]);
});

test("two agents started in separate browsers each come back with their own code and state", async ({
  browser,
  seed,
}) => {
  const first = await seed.createVerifiedAdmin();
  const second = await seed.createVerifiedAdmin();
  const results = await Promise.all(
    [
      { user: first, state: "state-first" },
      { user: second, state: "state-second" },
    ].map(async ({ user, state }) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await startAgentCallback();
      const agent = await registerAgent(context.request);
      await page.goto(agent.authorizeUrl(state));
      await signInForm(page, user.email, user.password);
      await expect(page).toHaveURL(new RegExp(`^${AGENT_CALLBACK}\\?code=`));
      const result = readCallback(page);
      await context.close();

      return result;
    }),
  );

  expect(results.map((item) => item.state).toSorted()).toEqual([
    "state-first",
    "state-second",
  ]);
  expect(new Set(results.map((item) => item.code)).size).toBe(2);
});

test("after connecting, the browser is signed in and the next normal sign-in is not hijacked", async ({
  page,
  request,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await startAgentCallback();
  const agent = await registerAgent(request);
  await page.goto(agent.authorizeUrl("state-after"));
  await signInForm(page, admin.email, admin.password);
  await expect(page).toHaveURL(new RegExp(`^${AGENT_CALLBACK}\\?code=`));

  const cookies = await page.context().cookies();
  expect(cookies.map((cookie) => cookie.name)).not.toContain(
    "oidc_login_prompt",
  );

  await page.goto("/admin/dashboard");
  await expect(page).toHaveURL(/\/admin\/dashboard$/);

  await page.context().request.post(`${API_URL}/api/auth/sign-out`, {
    headers: { Origin: "http://localhost:5173" },
  });
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await signInForm(page, admin.email, admin.password);
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
});

test("connecting shows up as one agent named by the client with the admin who connected it", async ({
  page,
  request,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  const id = token();
  await seed.authenticate(page.context(), admin.email);
  await startAgentCallback();
  const agent = await registerAgent(request, `Agent ${id}`);
  await page.goto(agent.authorizeUrl("state-card"));
  await accessTokenOf(
    await exchangeCode(request, agent, readCallback(page).code),
  );

  await page.goto("/admin/account");

  const card = agentCard(page, `Agent ${id}`);
  await expect(card).toHaveCount(1);
  await expect(card).toContainText(admin.email);
  await expect(card).toContainText(
    new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
      new Date(),
    ),
  );
});

test("the refresh grant gives a working new token, and the card still shows one agent", async ({
  page,
  request,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  const id = token();
  await seed.authenticate(page.context(), admin.email);
  const connected = await connectViaApi(page.context().request, `Agent ${id}`);

  const refreshed = await refreshWith(
    request,
    connected.agent,
    connected.refreshToken,
  );
  expect(refreshed.status()).toBe(200);
  const next = await refreshed.json();
  const nextAccess = String(field(next, "access_token"));
  expect((await mcp(request, nextAccess, "tools/list")).status()).toBe(200);

  await page.goto("/admin/account");
  await expect(agentCard(page, `Agent ${id}`)).toHaveCount(1);
});

test("removing an agent also kills its refresh token", async ({
  page,
  request,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  const id = token();
  await seed.authenticate(page.context(), admin.email);
  const connected = await connectViaApi(page.context().request, `Agent ${id}`);

  await page.goto("/admin/account");
  await agentCard(page, `Agent ${id}`)
    .getByRole("button", { name: "Agent actions" })
    .click();
  await page.getByRole("menuitem", { name: "Remove agent" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Remove agent" })
    .click();
  await expect(agentCard(page, `Agent ${id}`)).toHaveCount(0);

  const refreshed = await refreshWith(
    request,
    connected.agent,
    connected.refreshToken,
  );
  expect(refreshed.status()).toBeGreaterThanOrEqual(400);
  expect(await seed.listOAuthTokens(admin.email)).toEqual([]);
});

import { test, expect } from "../fixtures";
import { API_URL } from "../config";
import {
  accessTokenOf,
  AGENT_CALLBACK,
  startAgentCallback,
  exchangeCode,
  field,
  mcp,
  namesOf,
  readCallback,
  registerAgent,
  toolAnswer,
} from "./mcp-support";
import { club, token } from "./support";

const signInForm = async (
  page: import("@playwright/test").Page,
  email: string,
  password: string,
) => {
  await page.getByLabel("Email address").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
};

test("an agent is sent to sign in, comes back with a code and searches Skool without anything being saved", async ({
  page,
  request,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  const id = token();
  const keyword = `agent ${id}`;
  const script = {
    keyword,
    searches: {
      "public-paid": [
        club(id, { suffix: "a", members: 120, price: 2900 }),
        club(id, { suffix: "b", members: 40 }),
      ],
    },
  };
  await seed.scriptSkool(script);
  await startAgentCallback();
  const agent = await registerAgent(request);

  try {
    await page.goto(agent.authorizeUrl("state-main"));
    await expect(page).toHaveURL(/\/sign-in\?.*client_id=/);

    await signInForm(page, admin.email, admin.password);
    await expect(page).toHaveURL(new RegExp(`^${AGENT_CALLBACK}\\?code=`));
    const { code, state } = readCallback(page);
    expect(state).toBe("state-main");

    const exchanged = await exchangeCode(request, agent, code);
    const accessToken = await accessTokenOf(exchanged);

    await expect
      .poll(() => seed.listOAuthTokens(admin.email))
      .toEqual([
        expect.objectContaining({ clientId: agent.clientId, accessToken }),
      ]);

    const listed = await mcp(request, accessToken, "tools/list");
    expect(listed.status()).toBe(200);
    expect(JSON.stringify(await listed.json())).toContain("search_communities");

    const searched = await toolAnswer(
      await mcp(request, accessToken, "tools/call", {
        name: "search_communities",
        arguments: { keyword },
      }),
    );
    expect(searched.isError).toBe(false);
    expect(namesOf(searched.value).toSorted()).toEqual([
      `club-${id}-a`,
      `club-${id}-b`,
    ]);

    // Nothing the agent saw was kept on the platform
    expect(
      await seed.findCommunityBySkoolId(`scripted-club-${id}-a`),
    ).toBeNull();
    expect(await seed.listLeadsByUsernamePrefix(`e2e-${id}`)).toEqual([]);
    expect(await seed.findCampaignByName(keyword)).toBeNull();

    await page.goto("/admin/leads?search=" + id);
    await expect(page.getByText("No leads found.")).toBeVisible();
  } finally {
    await seed.unscriptSkool(script);
  }
});

test("an admin who is already signed in is never shown the sign-in page", async ({
  page,
  request,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  await startAgentCallback();
  const agent = await registerAgent(request);

  await page.goto(agent.authorizeUrl("state-signed-in"));

  await expect(page).toHaveURL(new RegExp(`^${AGENT_CALLBACK}\\?code=`));
  expect(readCallback(page).state).toBe("state-signed-in");
  const accessToken = await accessTokenOf(
    await exchangeCode(request, agent, readCallback(page).code),
  );
  const tokens = await seed.listOAuthTokens(admin.email);
  expect(tokens).toEqual([
    expect.objectContaining({ clientId: agent.clientId, accessToken }),
  ]);
});

test("a wrong password keeps the agent's request on the page and a second try completes it", async ({
  page,
  request,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await startAgentCallback();
  const agent = await registerAgent(request);

  await page.goto(agent.authorizeUrl("state-retry"));
  await signInForm(page, admin.email, "WrongPassword123!");

  await expect(page).toHaveURL(/\/sign-in\?.*client_id=/);
  expect(await seed.listOAuthTokens(admin.email)).toEqual([]);

  await signInForm(page, admin.email, admin.password);

  await expect(page).toHaveURL(new RegExp(`^${AGENT_CALLBACK}\\?code=`));
  expect(readCallback(page).state).toBe("state-retry");
});

test("signing in without an agent still lands on the dashboard", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();

  await page.goto("/sign-in");
  await signInForm(page, admin.email, admin.password);

  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  expect(await seed.listOAuthTokens(admin.email)).toEqual([]);
});

test("a member can connect an agent but the agent's token is refused and nothing reaches Skool", async ({
  page,
  request,
  seed,
}) => {
  const member = await seed.createVerifiedMember();
  const id = token();
  const keyword = `member ${id}`;
  const script = {
    keyword,
    searches: { "public-paid": [club(id, { suffix: "a", price: 2900 })] },
  };
  await seed.scriptSkool(script);
  await startAgentCallback();
  const agent = await registerAgent(request);

  try {
    await page.goto(agent.authorizeUrl("state-member"));
    await signInForm(page, member.email, member.password);
    await expect(page).toHaveURL(new RegExp(`^${AGENT_CALLBACK}\\?code=`));
    const accessToken = await accessTokenOf(
      await exchangeCode(request, agent, readCallback(page).code),
    );

    const listed = await mcp(request, accessToken, "tools/list");
    const searched = await mcp(request, accessToken, "tools/call", {
      name: "search_communities",
      arguments: { keyword },
    });

    expect(listed.status()).toBe(403);
    expect(searched.status()).toBe(403);
  } finally {
    await seed.unscriptSkool(script);
  }
});

test("a token that expired, or never existed, is told to authenticate again", async ({
  page,
  request,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  await startAgentCallback();
  const agent = await registerAgent(request);
  await page.goto(agent.authorizeUrl("state-expiry"));
  const accessToken = await accessTokenOf(
    await exchangeCode(request, agent, readCallback(page).code),
  );
  expect((await mcp(request, accessToken, "tools/list")).status()).toBe(200);

  await seed.expireOAuthTokens(admin.email);

  const expired = await mcp(request, accessToken, "tools/list");
  const unknown = await mcp(request, "not-a-token", "tools/list");
  const anonymous = await mcp(request, null, "tools/list");
  for (const response of [expired, unknown, anonymous]) {
    expect(response.status()).toBe(401);
    expect(response.headers()["www-authenticate"]).toContain(
      "oauth-protected-resource",
    );
  }
});

test("an authorization code works once", async ({ page, request, seed }) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  await startAgentCallback();
  const agent = await registerAgent(request);
  await page.goto(agent.authorizeUrl("state-once"));
  const { code } = readCallback(page);

  const first = await exchangeCode(request, agent, code);
  const second = await exchangeCode(request, agent, code);

  expect(first.status()).toBe(200);
  expect(second.status()).toBeGreaterThanOrEqual(400);
  expect(await seed.listOAuthTokens(admin.email)).toHaveLength(1);
});

test("a wrong verifier is refused and burns the code, so even the right verifier fails afterwards", async ({
  page,
  request,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  await startAgentCallback();
  const agent = await registerAgent(request);
  await page.goto(agent.authorizeUrl("state-burn"));
  const { code } = readCallback(page);

  const stolen = await request.post(`${API_URL}/api/auth/mcp/token`, {
    form: {
      grant_type: "authorization_code",
      code,
      redirect_uri: AGENT_CALLBACK,
      client_id: agent.clientId,
      code_verifier: "w".repeat(64),
    },
  });
  expect(stolen.status()).toBeGreaterThanOrEqual(400);
  expect(await seed.listOAuthTokens(admin.email)).toEqual([]);

  const genuine = await exchangeCode(request, agent, code);

  expect(genuine.status()).toBeGreaterThanOrEqual(400);
  expect(await seed.listOAuthTokens(admin.email)).toEqual([]);
});

test("the discovery documents are public and the MCP endpoint takes only POST", async ({
  request,
}) => {
  const resource = await request.get(
    `${API_URL}/.well-known/oauth-protected-resource`,
  );
  const authorization = await request.get(
    `${API_URL}/.well-known/oauth-authorization-server`,
  );

  expect(resource.status()).toBe(200);
  expect(String(field(await resource.json(), "resource"))).toBe(
    `${API_URL}/api/mcp`,
  );
  expect(authorization.status()).toBe(200);
  expect(String(field(await authorization.json(), "issuer"))).toContain(
    API_URL,
  );

  for (const method of ["GET", "DELETE"] as const) {
    const response = await request.fetch(`${API_URL}/api/mcp`, { method });
    expect([method, response.status()]).toEqual([method, 405]);
    expect(response.headers()["allow"]).toBe("POST");
  }
});

test("two agents searching at once each get their own results", async ({
  page,
  request,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  await startAgentCallback();
  const id = token();
  const scripts = ["one", "two"].map((suffix) => ({
    keyword: `${suffix} ${id}`,
    searches: {
      "public-paid": [club(id, { suffix, members: 100, price: 1900 })],
    },
  }));
  for (const script of scripts) await seed.scriptSkool(script);

  try {
    const tokens: string[] = [];
    for (const state of ["a", "b"]) {
      const agent = await registerAgent(request);
      await page.goto(agent.authorizeUrl(`state-${state}`));
      tokens.push(
        await accessTokenOf(
          await exchangeCode(request, agent, readCallback(page).code),
        ),
      );
    }

    const answers = await Promise.all(
      tokens.flatMap((accessToken) =>
        scripts.map(async (script) => ({
          keyword: script.keyword,
          answer: await toolAnswer(
            await mcp(request, accessToken, "tools/call", {
              name: "search_communities",
              arguments: { keyword: script.keyword },
            }),
          ),
        })),
      ),
    );

    for (const { keyword, answer } of answers) {
      const suffix = keyword.split(" ")[0];
      expect(namesOf(answer.value)).toEqual([`club-${id}-${suffix}`]);
    }
    expect(await seed.listOAuthTokens(admin.email)).toHaveLength(2);
  } finally {
    for (const script of scripts) await seed.unscriptSkool(script);
  }
});

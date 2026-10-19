import { test, expect } from "../fixtures";
import { API_URL, CLIENT_URL } from "../config";
import {
  authorizeAgent,
  callTool,
  connectViaApi,
  readCallback,
  registerAgent,
  startAgentCallback,
  AGENT_CALLBACK,
} from "./mcp-support";
import { token } from "./support";
import type { Page } from "@playwright/test";

const card = (page: Page, name: string) =>
  page
    .locator('[data-slot="card"] [data-slot="card"]')
    .filter({ hasText: name });

const rows = (page: Page) =>
  page.getByRole("row").filter({ has: page.locator("td") });

const stat = (page: Page, label: string) =>
  page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole("button", { name: "Remove agent" }) })
    .getByText(label, { exact: true })
    .locator("xpath=following-sibling::div");

test("two different clients are two cards, each with its own history", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const chat = await connectViaApi(page.context().request, `ChatGPT ${id}`);
  const claude = await connectViaApi(page.context().request, `Claude ${id}`);
  await callTool(page.context().request, chat.accessToken, "list_leads", {
    page: 1,
  });
  await callTool(page.context().request, chat.accessToken, "list_leads", {
    page: 1,
  });
  await callTool(page.context().request, claude.accessToken, "list_leads", {
    page: 1,
  });

  await page.goto("/admin/account");
  await expect(card(page, `ChatGPT ${id}`)).toHaveCount(1);
  await expect(card(page, `Claude ${id}`)).toHaveCount(1);

  await card(page, `ChatGPT ${id}`).click();
  await expect(stat(page, "Requests")).toHaveText("2");
  await page.goBack();
  await card(page, `Claude ${id}`).click();

  await expect(stat(page, "Requests")).toHaveText("1");
  await expect(rows(page)).toHaveCount(1);
});

test("the same agent authorizing twice is still one card with one history", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const signedIn = page.context().request;
  const agent = await registerAgent(signedIn, `Twice ${id}`);
  const first = await authorizeAgent(signedIn, agent, "first");
  const second = await authorizeAgent(signedIn, agent, "second");
  await callTool(signedIn, first.accessToken, "list_leads", { page: 1 });
  await callTool(signedIn, second.accessToken, "list_leads", { page: 1 });

  await page.goto("/admin/account");
  await expect(card(page, `Twice ${id}`)).toHaveCount(1);
  await card(page, `Twice ${id}`).click();

  await expect(stat(page, "Requests")).toHaveText("2");
  await expect(rows(page)).toHaveCount(2);
});

test("a client named like a script is shown as text and runs nothing", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const name = `<script>window.__agentRan = true</script> ${id}`;
  const { agent } = await connectViaApi(page.context().request, name);

  await page.goto("/admin/account");
  await expect(card(page, id)).toContainText("<script>");
  await card(page, id).click();
  await expect(page).toHaveURL(new RegExp(agent.clientId));

  expect(
    await page.evaluate(() => Reflect.get(window, "__agentRan")),
  ).toBeUndefined();
});

test("a client name of a thousand characters does not break either page", async ({
  browser,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  const context = await browser.newContext({
    viewport: { width: 390, height: 900 },
  });
  await seed.authenticate(context, admin.email);
  const id = token();
  const { agent } = await connectViaApi(
    context.request,
    `${id}${"w".repeat(1000)}`,
  );
  const page = await context.newPage();

  await page.goto("/admin/account");
  await expect(card(page, id)).toHaveCount(1);
  const accountOverflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  await page.goto(`/admin/agents/${agent.clientId}`);
  await expect(
    page.getByRole("button", { name: "Remove agent" }),
  ).toBeVisible();
  const agentOverflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );

  expect([accountOverflows, agentOverflows]).toEqual([false, false]);
  await context.close();
});

test("removing an agent that was removed elsewhere says so and leaves its page", async ({
  browser,
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const { agent } = await connectViaApi(
    page.context().request,
    `Gone ${token()}`,
  );
  await page.goto(`/admin/agents/${agent.clientId}`);
  await expect(
    page.getByRole("button", { name: "Remove agent" }),
  ).toBeVisible();
  const elsewhere = await browser.newContext();
  await seed.authenticate(elsewhere, admin.email);
  const removed = await elsewhere.request.delete(
    `${API_URL}/api/agents/${agent.clientId}`,
    {
      headers: { Origin: CLIENT_URL },
    },
  );
  expect(removed.status()).toBe(204);

  await page.getByRole("button", { name: "Remove agent" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Remove agent" })
    .click();

  await expect(page.getByText("Agent not found.")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/account$/);
  await elsewhere.close();
});

test("a member's Account settings has no Agent access card and every other card still works", async ({
  page,
  seed,
}) => {
  const member = await seed.createVerifiedMember();
  await seed.authenticate(page.context(), member.email);

  await page.goto("/admin/account");

  await expect(page.getByText("Sign in again")).toHaveCount(0);
  await expect(page.getByText("Agent access")).toHaveCount(0);
  await expect(page.getByLabel("MCP server address")).toHaveCount(0);
  await expect(page.getByText("Sessions and devices")).toBeVisible();
});

test("an admin whose sign-in is days old can still connect an agent", async ({
  page,
  request,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  await seed.ageSessions(admin.email);
  await startAgentCallback();
  const agent = await registerAgent(request);

  await page.goto(agent.authorizeUrl("state-old"));

  await expect(page).toHaveURL(new RegExp(`^${AGENT_CALLBACK}\\?code=`));
  expect(readCallback(page).state).toBe("state-old");
});

test("when the agent list cannot load, the card says so, the rest of the page works and trying again recovers", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  await connectViaApi(page.context().request, `Recover ${id}`);
  await page.route("**/api/agents", (route) =>
    route.fulfill({ status: 500, json: { message: "boom", statusCode: 500 } }),
  );

  await page.goto("/admin/account");

  // A failed request is retried a few times before the card gives up
  await expect(
    page.getByText("Could not load the connected agents."),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Sessions and devices")).toBeVisible();
  await expect(page.getByLabel("MCP server address")).toBeVisible();

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.getByRole("button", { name: "Try again" }).click();

  await expect(card(page, `Recover ${id}`)).toHaveCount(1);
});

test("when the request list fails the agent's details still show and the table says it failed", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const { agent } = await connectViaApi(
    page.context().request,
    `Failing ${token()}`,
  );
  await page.route("**/api/agents/*/requests*", (route) =>
    route.fulfill({ status: 500, json: { message: "boom", statusCode: 500 } }),
  );

  await page.goto(`/admin/agents/${agent.clientId}`);

  await expect(page.getByText("Could not load the requests.")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(agent.clientId)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remove agent" }),
  ).toBeVisible();
});

test("the details and the requests load independently", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const { agent, accessToken } = await connectViaApi(
    page.context().request,
    `Independent ${token()}`,
  );
  await callTool(page.context().request, accessToken, "list_leads", {
    page: 1,
  });
  const hold = async (route: import("@playwright/test").Route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    await route.continue();
  };
  await page.route(`**/api/agents/${agent.clientId}`, hold);

  await page.goto(`/admin/agents/${agent.clientId}`);

  await expect(rows(page)).toHaveCount(1);
  await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remove agent" }),
  ).toBeVisible();
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.route("**/api/agents/*/requests*", hold);
  await page.reload();

  await expect(
    page.getByRole("button", { name: "Remove agent" }),
  ).toBeVisible();
  await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible();
  await expect(rows(page)).toHaveCount(1);
});

test("copying the client ID needs no network", async ({ page, seed }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const { agent } = await connectViaApi(
    page.context().request,
    `Offline ${token()}`,
  );
  await page.goto(`/admin/agents/${agent.clientId}`);
  await expect(
    page.getByRole("button", { name: "Copy client ID" }),
  ).toBeVisible();

  await page.context().setOffline(true);
  await page.getByRole("button", { name: "Copy client ID" }).click();

  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    agent.clientId,
  );
  await page.context().setOffline(false);
});

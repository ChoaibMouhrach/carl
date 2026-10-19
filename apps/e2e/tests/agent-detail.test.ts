import { test, expect } from "../fixtures";
import { API_URL, CLIENT_URL } from "../config";
import { AGENT_CALLBACK, callTool, connectViaApi } from "./mcp-support";
import { club, token } from "./support";
import type { Page } from "@playwright/test";

const card = (page: Page, name: string) =>
  page
    .locator('[data-slot="card"] [data-slot="card"]')
    .filter({ hasText: name });

const sheet = (page: Page) => page.locator('[data-slot="sheet-content"]');

const rows = (page: Page) =>
  page.getByRole("row").filter({ has: page.locator("td") });

test("the card's menu opens wide enough for its text on one line and does not open the agent", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  await connectViaApi(page.context().request, `Agent ${id}`);

  await page.goto("/admin/account");
  await card(page, `Agent ${id}`)
    .getByRole("button", { name: "Agent actions" })
    .click();

  const item = page.getByRole("menuitem", { name: "Remove agent" });
  await expect(item).toBeVisible();
  const box = await item.boundingBox();
  expect(box?.height ?? 99).toBeLessThan(40);
  expect(box?.width ?? 0).toBeGreaterThan(120);
  await expect(page).toHaveURL(/\/admin\/account$/);
});

test("clicking an agent opens its page with its details and an empty request list", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const { agent } = await connectViaApi(page.context().request, `Agent ${id}`);

  await page.goto("/admin/account");
  await card(page, `Agent ${id}`).click();

  await expect(page).toHaveURL(new RegExp(`/admin/agents/${agent.clientId}`));
  await expect(page.getByText(`Agent ${id}`, { exact: true })).toBeVisible();
  await expect(
    page.getByRole("main").getByText(admin.email, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(agent.clientId)).toBeVisible();
  await expect(page.getByText(AGENT_CALLBACK)).toBeVisible();
  await expect(
    page.getByText("This agent has not made any requests yet."),
  ).toBeVisible();

  await page.getByRole("link", { name: "Account settings" }).click();
  await expect(page).toHaveURL(/\/admin\/account$/);
});

test("the agent's requests are listed newest first with their method, tool and outcome", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const keyword = `log ${id}`;
  const script = {
    keyword,
    searches: {
      "public-paid": [
        club(id, { suffix: "a", price: 1000 }),
        club(id, { suffix: "bad", price: 1000, failAbout: true }),
      ],
    },
  };
  await seed.scriptSkool(script);

  try {
    const { agent, accessToken } = await connectViaApi(
      page.context().request,
      `Agent ${id}`,
    );
    const request = page.context().request;
    await callTool(request, accessToken, "search_communities", { keyword });
    await callTool(request, accessToken, "get_community", {
      name: `club-${id}-bad`,
    });

    await page.goto(`/admin/agents/${agent.clientId}`);

    await expect(rows(page)).toHaveCount(2);
    await expect(rows(page).first()).toContainText("get_community");
    await expect(rows(page).first()).toContainText("Error");
    await expect(rows(page).nth(1)).toContainText("search_communities");
    await expect(rows(page).nth(1)).toContainText("OK");
    await expect(page.getByText("2", { exact: true }).first()).toBeVisible();
  } finally {
    await seed.unscriptSkool(script);
  }
});

test("a request opens with its request and response as code that can be copied, and the link keeps it open", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const id = token();
  const keyword = `view ${id}`;
  const script = {
    keyword,
    searches: { "public-paid": [club(id, { suffix: "a", price: 1000 })] },
  };
  await seed.scriptSkool(script);

  try {
    const { agent, accessToken } = await connectViaApi(
      page.context().request,
      `Agent ${id}`,
    );
    await callTool(page.context().request, accessToken, "search_communities", {
      keyword,
    });

    await page.goto(`/admin/agents/${agent.clientId}`);
    await rows(page).first().click();

    await expect(sheet(page)).toBeVisible();
    await expect(page).toHaveURL(/request=\d+/);
    await expect(sheet(page)).toContainText("tools/call · search_communities");
    const blocks = sheet(page).locator("pre");
    await expect(blocks).toHaveCount(2);
    await expect(blocks.first()).toContainText(`"keyword": "${keyword}"`);
    await expect(blocks.nth(1)).toContainText(`club-${id}-a`);
    // The tool's answer is shown as an object, not as an escaped string
    await expect(blocks.nth(1)).toContainText('"communities": [');
    await expect(blocks.nth(1)).not.toContainText('\\"');

    await sheet(page).getByRole("button", { name: "Copy" }).first().click();
    const copiedRequest = await page.evaluate(() =>
      navigator.clipboard.readText(),
    );
    expect(JSON.parse(copiedRequest)).toMatchObject({
      method: "tools/call",
      params: { name: "search_communities", arguments: { keyword } },
    });
    await sheet(page).getByRole("button", { name: "Copy" }).nth(1).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
      `club-${id}-a`,
    );

    await page.reload();
    await expect(sheet(page)).toContainText("tools/call · search_communities");

    await page.keyboard.press("Escape");
    await expect(sheet(page)).toHaveCount(0);
    await expect(page).not.toHaveURL(/request=/);
  } finally {
    await seed.unscriptSkool(script);
  }
});

test("more than twelve requests are paged", async ({ page, seed }) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const { agent, accessToken } = await connectViaApi(
    page.context().request,
    `Agent ${id}`,
  );
  for (let index = 0; index < 13; index += 1) {
    await callTool(page.context().request, accessToken, "list_leads", {
      page: 1,
    });
  }

  await page.goto(`/admin/agents/${agent.clientId}`);
  await expect(rows(page)).toHaveCount(12);

  await page
    .getByRole("navigation", { name: "pagination" })
    .getByText("2", { exact: true })
    .click();
  await expect(page).toHaveURL(/page=2/);
  await expect(rows(page)).toHaveCount(1);
});

test("the requests show a skeleton while they load", async ({ page, seed }) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const { agent } = await connectViaApi(
    page.context().request,
    `Agent ${token()}`,
  );
  await page.route("**/api/agents/*/requests*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.continue();
  });

  await page.goto(`/admin/agents/${agent.clientId}`);

  await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible();
  await expect(
    page.getByText("This agent has not made any requests yet."),
  ).toBeVisible();
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
});

test("removing the agent from its page returns to the account and deletes the agent and its history", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const { agent, accessToken } = await connectViaApi(
    page.context().request,
    `Agent ${id}`,
  );
  await callTool(page.context().request, accessToken, "list_leads", {
    page: 1,
  });

  await page.goto(`/admin/agents/${agent.clientId}`);
  await page.getByRole("button", { name: "Remove agent" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Remove agent" })
    .click();

  await expect(page).toHaveURL(/\/admin\/account$/);
  await expect(card(page, `Agent ${id}`)).toHaveCount(0);
  expect(await seed.listOAuthTokens(admin.email)).toEqual([]);
  const gone = await page
    .context()
    .request.get(`${API_URL}/api/agents/${agent.clientId}/requests`, {
      headers: { Origin: CLIENT_URL },
    });
  expect(gone.status()).toBe(404);
});

test("an agent that does not exist shows an error instead of an empty page", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);

  await page.goto("/admin/agents/not-an-agent");

  await expect(page.getByText("Agent not found.")).toBeVisible();
});

test("long requests scroll inside their box and never widen the page on a phone", async ({
  browser,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  const context = await browser.newContext({
    viewport: { width: 375, height: 800 },
  });
  await seed.authenticate(context, admin.email);
  const id = token();
  const { agent, accessToken } = await connectViaApi(
    context.request,
    `Agent ${id}`,
  );
  // A platform list, so no request leaves for Skool
  await callTool(context.request, accessToken, "list_leads", {
    search: "k".repeat(190),
  });
  const page = await context.newPage();

  await page.goto(`/admin/agents/${agent.clientId}`);
  await rows(page).first().click();
  await expect(sheet(page).locator("pre")).toHaveCount(2);

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflows).toBe(false);
  await context.close();
});

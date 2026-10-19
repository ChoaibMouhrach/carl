import { test, expect } from "../fixtures";
import { API_URL } from "../config";
import { callTool, connectViaApi, notify } from "./mcp-support";
import { token } from "./support";
import type { Page } from "@playwright/test";

const sheet = (page: Page) => page.locator('[data-slot="sheet-content"]');

const rows = (page: Page) =>
  page.getByRole("row").filter({ has: page.locator("td") });

const stat = (page: Page, label: string) =>
  page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole("button", { name: "Remove agent" }) })
    .getByText(label, { exact: true })
    .locator("xpath=following-sibling::div");

const setup = async (
  context: import("@playwright/test").BrowserContext,
  seed: Parameters<Parameters<typeof test>[2]>[0]["seed"],
) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(context, admin.email);
  const connected = await connectViaApi(context.request, `Agent ${token()}`);
  const call = (name: string, args: object) =>
    callTool(context.request, connected.accessToken, name, args);

  return { admin, call, ...connected };
};

test("a write the agent made is in the log, and its request and answer are readable", async ({
  page,
  seed,
}) => {
  const { agent, call } = await setup(page.context(), seed);
  const id = token();
  await call("create_lead", {
    skoolUsername: `e2e-${id}`,
    name: `Logged ${id}`,
  });

  await page.goto(`/admin/agents/${agent.clientId}`);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("create_lead");
  await expect(rows(page).first()).toContainText("OK");
  await rows(page).first().click();

  const blocks = sheet(page).locator("pre");
  await expect(blocks.first()).toContainText(`"skoolUsername": "e2e-${id}"`);
  await expect(blocks.nth(1)).toContainText('"leadId"');
  await expect(blocks.nth(1)).toContainText(`Logged ${id}`);
  expect(await seed.findLeadByUsername(`e2e-${id}`)).toMatchObject({
    name: `Logged ${id}`,
  });
});

test("a refused write is an Error in the log and its answer says it was refused", async ({
  page,
  seed,
}) => {
  const { agent, call } = await setup(page.context(), seed);
  const id = token();
  await seed.createLead({ skoolUsername: `e2e-${id}`, name: `Original ${id}` });
  await call("create_lead", {
    skoolUsername: `e2e-${id}`,
    name: `Imposter ${id}`,
  });

  await page.goto(`/admin/agents/${agent.clientId}`);
  await expect(rows(page).first()).toContainText("Error");
  await rows(page).first().click();

  await expect(sheet(page)).toContainText("Error");
  await expect(sheet(page).locator("pre").nth(1)).toContainText(
    '"isError": true',
  );
  expect(await seed.findLeadByUsername(`e2e-${id}`)).toMatchObject({
    name: `Original ${id}`,
  });
});

test("text with quotes, line breaks and emoji survives into the code view and the copy button", async ({
  page,
  seed,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const { agent, call } = await setup(page.context(), seed);
  const id = token();
  const bio = `He said "hi"\nthen left 🚀 — café ${id}`;
  await call("create_lead", {
    skoolUsername: `e2e-${id}`,
    name: `Text ${id}`,
    bio,
  });

  await page.goto(`/admin/agents/${agent.clientId}`);
  await rows(page).first().click();
  await sheet(page).getByRole("button", { name: "Copy" }).first().click();

  const copied = JSON.parse(
    await page.evaluate(() => navigator.clipboard.readText()),
  );
  expect(copied.params.arguments.bio).toBe(bio);
  expect(copied.params.arguments.skoolUsername).toBe(`e2e-${id}`);
  expect(await seed.findLeadByUsername(`e2e-${id}`)).toMatchObject({ bio });
});

test("a message the server acknowledges without answering opens with an empty response", async ({
  page,
  seed,
}) => {
  const { agent, accessToken } = await setup(page.context(), seed);
  const response = await notify(
    page.context().request,
    accessToken,
    "notifications/initialized",
  );
  expect(response.status()).toBe(202);

  await page.goto(`/admin/agents/${agent.clientId}`);
  await expect(rows(page).first()).toContainText("notifications/initialized");
  await rows(page).first().click();

  await expect(sheet(page).locator("pre").nth(1)).toContainText("(empty)");
});

test("the counts beside the table match the table and follow new calls after a reload", async ({
  page,
  seed,
}) => {
  const { agent, call } = await setup(page.context(), seed);
  await call("list_leads", { page: 1 });
  await call("create_lead", { skoolUsername: "", name: "" });
  await call("create_lead", { skoolUsername: "", name: "" });

  await page.goto(`/admin/agents/${agent.clientId}`);
  await expect(rows(page)).toHaveCount(3);
  await expect(stat(page, "Requests")).toHaveText("3");
  await expect(stat(page, "Errors")).toHaveText("2");

  await call("list_leads", { page: 1 });
  await page.reload();

  await expect(rows(page)).toHaveCount(4);
  await expect(stat(page, "Requests")).toHaveText("4");
  await expect(stat(page, "Errors")).toHaveText("2");
});

test("the request panel closes with Escape, its close button and a click outside it", async ({
  page,
  seed,
}) => {
  const { agent, call } = await setup(page.context(), seed);
  await call("list_leads", { page: 1 });
  await page.goto(`/admin/agents/${agent.clientId}`);

  for (const close of [
    () => page.keyboard.press("Escape"),
    () => sheet(page).getByRole("button", { name: "Close" }).click(),
    () => page.mouse.click(40, 400),
  ]) {
    await rows(page).first().click();
    await expect(sheet(page)).toBeVisible();
    await expect(page).toHaveURL(/request=\d+/);

    await close();

    await expect(sheet(page)).toHaveCount(0);
    await expect(page).not.toHaveURL(/request=/);
  }
});

test("a request id that does not exist, or belongs to another agent, says it was not found", async ({
  browser,
  page,
  seed,
}) => {
  const { admin, agent } = await setup(page.context(), seed);
  const other = await browser.newContext();
  await seed.authenticate(other, admin.email);
  const { accessToken: otherToken, agent: otherAgent } = await connectViaApi(
    other.request,
    `Other ${token()}`,
  );
  await callTool(other.request, otherToken, "list_leads", { page: 1 });
  await page.goto(`/admin/agents/${otherAgent.clientId}`);
  const theirs = await page.evaluate(
    async ([url]) =>
      (await fetch(url ?? "", { credentials: "include" })).json(),
    [`${API_URL}/api/agents/${otherAgent.clientId}/requests`],
  );
  const theirId = theirs.requests[0].mcpRequestId;

  await page.goto(`/admin/agents/${agent.clientId}?request=999999`);
  await expect(sheet(page)).toContainText("Request not found.");

  await page.goto(`/admin/agents/${agent.clientId}?request=${theirId}`);
  await expect(sheet(page)).toContainText("Request not found.");
  await expect(sheet(page).locator("pre")).toHaveCount(0);
  await other.close();
});

test("opening another request replaces the panel with that request", async ({
  page,
  seed,
}) => {
  const { agent, call } = await setup(page.context(), seed);
  await call("list_leads", { page: 1 });
  await call("list_campaigns", { page: 1 });
  await page.goto(`/admin/agents/${agent.clientId}`);

  await rows(page).filter({ hasText: "list_leads" }).click();
  await expect(sheet(page)).toContainText("tools/call · list_leads");
  await page.keyboard.press("Escape");
  await rows(page).filter({ hasText: "list_campaigns" }).click();

  await expect(sheet(page)).toContainText("tools/call · list_campaigns");
  await expect(sheet(page)).not.toContainText("list_leads");
});

test("the browser's back and forward buttons close and reopen the panel", async ({
  page,
  seed,
}) => {
  const { agent, call } = await setup(page.context(), seed);
  await call("list_leads", { page: 1 });
  await page.goto(`/admin/agents/${agent.clientId}`);

  await rows(page).first().click();
  await expect(sheet(page)).toBeVisible();
  await page.goBack();
  await expect(sheet(page)).toHaveCount(0);
  await page.goForward();

  await expect(sheet(page)).toBeVisible();
  await expect(page).toHaveURL(/request=\d+/);
});

test("a long answer scrolls inside its box and never widens the page", async ({
  page,
  seed,
}) => {
  const { agent, call } = await setup(page.context(), seed);
  const id = token();
  for (let index = 0; index < 12; index += 1) {
    await seed.createLead({
      skoolUsername: `e2e-${id}-${index}`,
      name: `Long answer lead ${id} ${index}`,
    });
  }
  await call("list_leads", { page: 1, search: id });

  await page.goto(`/admin/agents/${agent.clientId}`);
  await rows(page).first().click();

  const response = sheet(page).locator('[data-slot="scroll-area"]').nth(2);
  const viewport = response.locator('[data-slot="scroll-area-viewport"]');
  await expect(viewport).toBeVisible();
  const scrolls = await viewport.evaluate(
    (element) => element.scrollHeight > element.clientHeight,
  );
  expect(scrolls).toBe(true);
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflows).toBe(false);
});

test("closing a request opened from the second page leaves the page where it was", async ({
  page,
  seed,
}) => {
  const { agent, call } = await setup(page.context(), seed);
  for (let index = 0; index < 13; index += 1) {
    await call("list_leads", { page: 1 });
  }
  await page.goto(`/admin/agents/${agent.clientId}?page=2`);
  await expect(rows(page)).toHaveCount(1);

  await rows(page).first().click();
  await expect(sheet(page)).toBeVisible();
  await page.keyboard.press("Escape");

  await expect(sheet(page)).toHaveCount(0);
  await expect(page).toHaveURL(/page=2/);
  await expect(page).not.toHaveURL(/request=/);
  await expect(rows(page)).toHaveCount(1);
});

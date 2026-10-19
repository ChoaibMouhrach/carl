import { test, expect } from "../fixtures";
import { API_URL, CLIENT_URL } from "../config";
import { connectViaApi, mcp } from "./mcp-support";
import { token } from "./support";
import type { Page } from "@playwright/test";

const agentCard = (page: Page, name: string) =>
  page
    .locator('[data-slot="card"] [data-slot="card"]')
    .filter({ hasText: name });

const removeFromCard = async (page: Page, name: string) => {
  await agentCard(page, name)
    .getByRole("button", { name: "Agent actions" })
    .click();
  await page.getByRole("menuitem", { name: "Remove agent" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Remove agent" })
    .click();
};

test("an agent named with markup is shown as plain text", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const name = `<b>bold</b> & "quoted" ${id}`;
  await connectViaApi(page.context().request, name);

  await page.goto("/admin/account");

  const card = agentCard(page, id);
  await expect(card).toContainText(name);
  await expect(card.locator("b")).toHaveCount(0);
});

test("a very long agent name does not push the page sideways, even on a phone", async ({
  browser,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  const context = await browser.newContext({
    viewport: { width: 375, height: 800 },
  });
  await seed.authenticate(context, admin.email);
  const id = token();
  await connectViaApi(context.request, `${id}${"x".repeat(200)}`);
  const page = await context.newPage();

  await page.goto("/admin/account");

  await expect(agentCard(page, id)).toHaveCount(1);
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflows).toBe(false);
  await context.close();
});

test("thirteen agents all show, newest first", async ({ page, seed }) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const names = Array.from(
    { length: 13 },
    (_, index) => `${id}-${String(index + 1).padStart(2, "0")}`,
  );
  for (const name of names) {
    await connectViaApi(page.context().request, name);
  }

  await page.goto("/admin/account");

  const cards = page
    .locator('[data-slot="card"] [data-slot="card"]')
    .filter({ hasText: id });
  await expect(cards).toHaveCount(13);
  const titles = await cards
    .locator('[data-slot="card-title"]')
    .allTextContents();
  expect(titles).toEqual([...names].reverse());
});

test("pressing confirm twice removes the agent with one request", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const { accessToken } = await connectViaApi(
    page.context().request,
    `Agent ${id}`,
  );
  const deletes: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "DELETE" &&
      request.url().includes("/api/agents/")
    ) {
      deletes.push(request.url());
    }
  });

  await page.goto("/admin/account");
  await agentCard(page, `Agent ${id}`)
    .getByRole("button", { name: "Agent actions" })
    .click();
  await page.getByRole("menuitem", { name: "Remove agent" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Remove agent" })
    .dblclick({ force: true })
    .catch(() => undefined);

  await expect(agentCard(page, `Agent ${id}`)).toHaveCount(0);
  expect(deletes).toHaveLength(1);
  expect(
    (await mcp(page.context().request, accessToken, "tools/list")).status(),
  ).toBe(401);
});

test("removing an agent that was already removed elsewhere says so and the card goes", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const { agent } = await connectViaApi(page.context().request, `Agent ${id}`);

  await page.goto("/admin/account");
  await expect(agentCard(page, `Agent ${id}`)).toHaveCount(1);
  const elsewhere = await page
    .context()
    .request.delete(`${API_URL}/api/agents/${agent.clientId}`, {
      headers: { Origin: CLIENT_URL },
    });
  expect(elsewhere.status()).toBe(204);

  await removeFromCard(page, `Agent ${id}`);

  await expect(page.getByText("Agent not found.")).toBeVisible();
  await expect(agentCard(page, `Agent ${id}`)).toHaveCount(0);
  expect(await seed.listOAuthTokens(admin.email)).toEqual([]);
});

test("removing one agent leaves the other connected and working, and nothing else changes", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const lead = await seed.createLead({
    skoolUsername: `e2e-${id}`,
    name: `Lead ${id}`,
  });
  const keep = await connectViaApi(page.context().request, `Keep ${id}`);
  const drop = await connectViaApi(page.context().request, `Drop ${id}`);

  await page.goto("/admin/account");
  await removeFromCard(page, `Drop ${id}`);
  await expect(agentCard(page, `Drop ${id}`)).toHaveCount(0);

  await expect(agentCard(page, `Keep ${id}`)).toHaveCount(1);
  const request = page.context().request;
  expect((await mcp(request, keep.accessToken, "tools/list")).status()).toBe(
    200,
  );
  expect((await mcp(request, drop.accessToken, "tools/list")).status()).toBe(
    401,
  );
  expect(await seed.listOAuthTokens(admin.email)).toEqual([
    expect.objectContaining({ clientId: keep.agent.clientId }),
  ]);
  expect(await seed.findLeadByUsername(`e2e-${id}`)).toMatchObject({
    leadId: lead.leadId,
  });

  await page.reload();
  await expect(page.getByLabel("MCP server address")).toBeVisible();
});

test("a removed agent can connect again and shows up as a new card", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const first = await connectViaApi(page.context().request, `Agent ${id}`);

  await page.goto("/admin/account");
  await removeFromCard(page, `Agent ${id}`);
  await expect(agentCard(page, `Agent ${id}`)).toHaveCount(0);

  const again = await connectViaApi(page.context().request, `Agent ${id}`);
  expect(again.agent.clientId).not.toBe(first.agent.clientId);
  await page.reload();

  await expect(agentCard(page, `Agent ${id}`)).toHaveCount(1);
  expect(
    (
      await mcp(page.context().request, again.accessToken, "tools/list")
    ).status(),
  ).toBe(200);
});

test("another admin sees an agent connected by this one", async ({
  browser,
  seed,
}) => {
  const owner = await seed.createVerifiedAdmin();
  const other = await seed.createVerifiedAdmin();
  const ownerContext = await browser.newContext();
  const otherContext = await browser.newContext();
  await seed.authenticate(ownerContext, owner.email);
  await seed.authenticate(otherContext, other.email);
  const id = token();
  await connectViaApi(ownerContext.request, `Agent ${id}`);
  const page = await otherContext.newPage();

  await page.goto("/admin/account");

  await expect(agentCard(page, `Agent ${id}`)).toContainText(owner.email);
  await ownerContext.close();
  await otherContext.close();
});

test("a member is refused the agent list and cannot remove an agent", async ({
  page,
  browser,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  const member = await seed.createVerifiedMember();
  await seed.authenticate(page.context(), admin.email);
  const { agent, accessToken } = await connectViaApi(
    page.context().request,
    `Agent ${token()}`,
  );
  const memberContext = await browser.newContext();
  await seed.authenticate(memberContext, member.email);

  const listed = await memberContext.request.get(`${API_URL}/api/agents`);
  const removed = await memberContext.request.delete(
    `${API_URL}/api/agents/${agent.clientId}`,
    {
      headers: { Origin: CLIENT_URL },
    },
  );

  expect(listed.status()).toBe(403);
  expect(removed.status()).toBe(403);
  // Both refusals happen in the admin check, before anything is deleted
  expect(await seed.listOAuthTokens(admin.email)).toHaveLength(1);
  expect(
    (await mcp(page.context().request, accessToken, "tools/list")).status(),
  ).toBe(200);
  await memberContext.close();
});

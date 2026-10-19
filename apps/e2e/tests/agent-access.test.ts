import { test, expect } from "../fixtures";
import { API_URL } from "../config";
import { token } from "./support";
import {
  accessTokenOf,
  startAgentCallback,
  exchangeCode,
  mcp,
  readCallback,
  registerAgent,
} from "./mcp-support";

const connectAgent = async (
  page: import("@playwright/test").Page,
  request: import("@playwright/test").APIRequestContext,
  name: string,
) => {
  await startAgentCallback();
  const agent = await registerAgent(request, name);
  await page.goto(agent.authorizeUrl("state-page"));
  const accessToken = await accessTokenOf(
    await exchangeCode(request, agent, readCallback(page).code),
  );

  return { accessToken };
};

test("the account settings give the address to hand an agent and it can be copied", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

  await page.goto("/admin/account");

  await expect(page.getByLabel("MCP server address")).toHaveValue(
    `${API_URL}/api/mcp`,
  );
  await page.getByRole("button", { name: "Copy" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${API_URL}/api/mcp`,
  );
});

test("the connected agents list shows a skeleton first and then says nothing is connected", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  // The agent list is shared by every admin, so an empty one can only be staged
  await page.route("**/api/agents", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({ json: { agents: [] } });
  });

  await page.goto("/admin/account");

  await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible();
  await expect(page.getByText("No agents connected yet.")).toBeVisible();
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
});

test("a connected agent is listed with who connected it and removing it signs it out", async ({
  page,
  request,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const { accessToken } = await connectAgent(page, request, `Agent ${id}`);
  expect((await mcp(request, accessToken, "tools/list")).status()).toBe(200);

  await page.goto("/admin/account");
  const row = page
    .locator('[data-slot="card"] [data-slot="card"]')
    .filter({ hasText: `Agent ${id}` });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(admin.email);

  await row.getByRole("button", { name: "Agent actions" }).click();
  await page.getByRole("menuitem", { name: "Remove agent" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cancel" })
    .click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(await seed.listOAuthTokens(admin.email)).toHaveLength(1);

  await row.getByRole("button", { name: "Agent actions" }).click();
  await page.getByRole("menuitem", { name: "Remove agent" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Remove agent" })
    .click();

  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(row).toHaveCount(0);
  await expect.poll(() => seed.listOAuthTokens(admin.email)).toEqual([]);
  expect((await mcp(request, accessToken, "tools/list")).status()).toBe(401);
});

test("a sign-in from days ago still lists its sessions", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  await seed.ageSessions(admin.email);

  await page.goto("/admin/account");

  await expect(page.getByText("Current device")).toBeVisible();
  await expect(page.getByText("Session is not fresh")).toHaveCount(0);
  await expect(page.getByText("SESSION_NOT_FRESH")).toHaveCount(0);
  expect(await seed.getActiveSessionCount(admin.email)).toBe(1);
});

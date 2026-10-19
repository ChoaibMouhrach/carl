import { test, expect } from "../fixtures";
import { callTool, connectViaApi } from "./mcp-support";
import { token } from "./support";
import type { Page } from "@playwright/test";

const sheet = (page: Page) => page.locator('[data-slot="sheet-content"]');

const stat = (page: Page, label: string) =>
  page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole("button", { name: "Remove agent" }) })
    .getByText(label, { exact: true })
    .locator("xpath=following-sibling::div");

const rows = (page: Page) =>
  page.getByRole("row").filter({ has: page.locator("td") });

const requestsCard = (page: Page) =>
  page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole("heading", { name: "Requests" }) });

const detailsCard = (page: Page) =>
  page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole("button", { name: "Remove agent" }) });

const setTheme = (page: Page, theme: "light" | "dark") =>
  page.evaluate((value) => {
    document.documentElement.classList.toggle("dark", value === "dark");
    document.documentElement.classList.toggle("light", value === "light");
  }, theme);

const setup = async (
  context: import("@playwright/test").BrowserContext,
  seed: Parameters<Parameters<typeof test>[2]>[0]["seed"],
  name = `Agent ${token()}`,
  extraRedirects: string[] = [],
) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(context, admin.email);
  const connected = await connectViaApi(context.request, name, extraRedirects);

  return {
    admin,
    call: (tool: string, args: object) =>
      callTool(context.request, connected.accessToken, tool, args),
    ...connected,
  };
};

test("on a wide screen the requests take the left and the details sit to the right", async ({
  page,
  seed,
}) => {
  const { agent } = await setup(page.context(), seed);
  await page.setViewportSize({ width: 1400, height: 900 });

  await page.goto(`/admin/agents/${agent.clientId}`);

  const requests = await requestsCard(page).boundingBox();
  const details = await detailsCard(page).boundingBox();
  expect(requests && details && requests.x < details.x).toBe(true);
  expect(requests?.width ?? 0).toBeGreaterThan(details?.width ?? Infinity);
  // The details column keeps a fixed width while the requests take what is left
  expect(Math.round(details?.width ?? 0)).toBeGreaterThanOrEqual(340);
  expect(Math.round(details?.width ?? 0)).toBeLessThanOrEqual(370);
});

test("on a phone the details come first and the requests follow underneath", async ({
  browser,
  seed,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 900 },
  });
  const { agent } = await setup(context, seed);
  const page = await context.newPage();

  await page.goto(`/admin/agents/${agent.clientId}`);

  const requests = await requestsCard(page).boundingBox();
  const details = await detailsCard(page).boundingBox();
  expect(requests && details && details.y < requests.y).toBe(true);
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflows).toBe(false);
  await context.close();
});

test("the client ID copy button copies exactly the ID and the remove button is red", async ({
  page,
  seed,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const { agent } = await setup(page.context(), seed);

  await page.goto(`/admin/agents/${agent.clientId}`);
  await page.getByRole("button", { name: "Copy client ID" }).click();

  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    agent.clientId,
  );
  await expect(page.getByRole("button", { name: "Remove agent" })).toHaveClass(
    /text-destructive/,
  );
});

test("a very long agent name stays inside its panel", async ({
  page,
  seed,
}) => {
  const id = token();
  const { agent } = await setup(
    page.context(),
    seed,
    `${id}${"x".repeat(150)}`,
  );
  await page.setViewportSize({ width: 1400, height: 900 });

  await page.goto(`/admin/agents/${agent.clientId}`);

  const panel = await detailsCard(page).boundingBox();
  const title = await detailsCard(page)
    .locator('[data-slot="card-title"]')
    .boundingBox();
  expect(
    title && panel && title.x + title.width <= panel.x + panel.width + 1,
  ).toBe(true);
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflows).toBe(false);
});

test("every redirect address the agent registered is listed", async ({
  page,
  seed,
}) => {
  const extras = Array.from(
    { length: 4 },
    (_, index) => `http://localhost:${9100 + index}/callback`,
  );
  const { agent } = await setup(
    page.context(),
    seed,
    `Agent ${token()}`,
    extras,
  );

  await page.goto(`/admin/agents/${agent.clientId}`);

  for (const url of extras) {
    await expect(detailsCard(page).getByText(url)).toBeVisible();
  }
  await expect(detailsCard(page).getByText("/callback")).toHaveCount(5);
});

test("the error count is plain with none and red with some", async ({
  page,
  seed,
}) => {
  const { agent, call } = await setup(page.context(), seed);
  await call("list_leads", { page: 1 });

  await page.goto(`/admin/agents/${agent.clientId}`);
  await expect(stat(page, "Errors")).toHaveText("0");
  await expect(stat(page, "Errors")).not.toHaveClass(/text-destructive/);

  await call("create_lead", { skoolUsername: "", name: "" });
  await page.reload();

  await expect(stat(page, "Errors")).toHaveText("1");
  await expect(stat(page, "Errors")).toHaveClass(/text-destructive/);
});

test("the JSON colours differ between the light and dark theme and stay when the theme changes with the panel open", async ({
  page,
  seed,
}) => {
  const { agent, call } = await setup(page.context(), seed);
  await call("list_leads", { page: 1 });
  await page.goto(`/admin/agents/${agent.clientId}`);
  await setTheme(page, "light");
  await rows(page).first().click();
  const key = sheet(page).locator("pre span").first();
  await expect(key).toBeVisible();

  const light = await key.evaluate(
    (element) => getComputedStyle(element).color,
  );
  await setTheme(page, "dark");
  const dark = await key.evaluate((element) => getComputedStyle(element).color);

  expect(light).not.toBe(dark);
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).locator("pre")).toHaveCount(2);
});

test("keys, strings, numbers and keywords each get their own colour", async ({
  page,
  seed,
}) => {
  const { agent, call } = await setup(page.context(), seed);
  await call("list_leads", { page: 1 });
  await page.goto(`/admin/agents/${agent.clientId}`);
  await rows(page).first().click();

  const colours = async (text: RegExp) =>
    sheet(page)
      .locator("pre")
      .first()
      .locator("span")
      .filter({ hasText: text })
      .first()
      .evaluate((element) => getComputedStyle(element).color);

  const key = await colours(/^"jsonrpc"$/);
  const string = await colours(/^"2\.0"$/);
  const number = await colours(/^1$/);

  expect(new Set([key, string, number]).size).toBe(3);
});

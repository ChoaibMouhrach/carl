import { test, expect } from "../fixtures";
import { API_URL } from "../config";
import { connectViaApi } from "./mcp-support";
import { token } from "./support";
import type { Page } from "@playwright/test";

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
  const post = (data: unknown, headers: Record<string, string> = {}) =>
    context.request.post(`${API_URL}/api/mcp`, {
      headers: {
        authorization: `Bearer ${connected.accessToken}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...headers,
      },
      data: JSON.stringify(data),
    });

  return { post, ...connected };
};

const list = { jsonrpc: "2.0", id: 1, method: "tools/list" };

test("plain HTTP clients with different Accept headers, or none, can all use the agent endpoint", async ({
  page,
  seed,
}) => {
  const { post, agent } = await setup(page.context(), seed);

  const statuses = await Promise.all(
    ["application/json", "text/event-stream", "*/*"].map(async (accept) =>
      (await post(list, { accept })).status(),
    ),
  );
  const refused = await post(list, { accept: "text/html" });

  expect(statuses).toEqual([200, 200, 200]);
  expect(refused.status()).toBe(406);
  await page.goto(`/admin/agents/${agent.clientId}`);
  await expect(rows(page)).toHaveCount(4);
  await expect(stat(page, "Requests")).toHaveText("4");
  await expect(stat(page, "Errors")).toHaveText("1");
});

test("a refused transport request shows on the agent page as an error with its JSON-RPC answer", async ({
  page,
  seed,
}) => {
  const { post, agent } = await setup(page.context(), seed);
  await post(list, { "content-type": "text/plain" });

  await page.goto(`/admin/agents/${agent.clientId}`);
  await expect(rows(page).first()).toContainText("Error");
  await rows(page).first().click();

  const sheet = page.locator('[data-slot="sheet-content"]');
  await expect(sheet).toContainText("HTTP 415");
  await expect(sheet.locator("pre").nth(1)).toContainText(
    "Unsupported Media Type",
  );
});

test("a client that sends an unknown protocol version is told which ones work", async ({
  page,
  seed,
}) => {
  const { post } = await setup(page.context(), seed);

  const unknown = await post(list, { "mcp-protocol-version": "1999-01-01" });
  const known = await post(list, { "mcp-protocol-version": "2025-03-26" });

  expect(unknown.status()).toBe(404);
  expect(await unknown.text()).toContain("supported versions");
  expect(known.status()).toBe(200);
});

test("every initialize is answered afresh, with no session to carry over", async ({
  page,
  seed,
}) => {
  const { post, agent } = await setup(page.context(), seed);
  const initialize = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "e2e", version: "1" },
    },
  };

  const first = await post(initialize);
  const second = await post(initialize, { "mcp-session-id": "made-up" });
  const batch = await post([initialize, list]);

  expect([first.status(), second.status(), batch.status()]).toEqual([
    200, 200, 400,
  ]);
  expect(first.headers()["mcp-session-id"]).toBeUndefined();
  await page.goto(`/admin/agents/${agent.clientId}`);
  await expect(stat(page, "Requests")).toHaveText("3");
  await expect(stat(page, "Errors")).toHaveText("1");
});

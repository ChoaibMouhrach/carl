import { test, expect } from "../fixtures";
import { API_URL } from "../config";

test.describe("MCP connections settings page", () => {
  test("shows a skeleton while the MCP connections list is loading", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();

    await page.route("**/api/mcp/connections", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });

    const listConnections = page.waitForResponse((response) =>
      response.url().includes("/api/mcp/connections"),
    );

    await seed.authenticate(page.context(), user.email);
    await page.goto("/app/user/account");

    await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible();
    await listConnections;
    await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
  });

  test("shows the empty-state message when the account has no MCP connections", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();

    await seed.authenticate(page.context(), user.email);
    await page.goto("/app/user/account");

    await expect(
      page.getByText("No apps are connected yet.", { exact: true }),
    ).toBeVisible();
  });

  test("displays a connected app's name and its connected/last-used dates", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const connection = await seed.createMcpConnection({
      userId: user.userId,
      name: "Claude Desktop",
    });

    await seed.authenticate(page.context(), user.email);
    await page.goto("/app/user/account");

    await expect(
      page.getByText("Claude Desktop", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/^Connected /)).toBeVisible();
    await expect(page.getByText(/^Last used /)).toBeVisible();

    const exists = await seed.mcpConnectionExists({
      clientId: connection.clientId,
      userId: user.userId,
    });
    expect(exists).toBe(true);
  });

  test("shows the MCP endpoint URL for connecting a client", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();

    await seed.authenticate(page.context(), user.email);
    await page.goto("/app/user/account");

    await expect(page.locator("input[readonly]")).toHaveValue(`${API_URL}/mcp`);
  });

  test("does not show another user's MCP connection on the current user's account page", async ({
    page,
    seed,
  }) => {
    const owner = await seed.createOnboardedUser();
    const other = await seed.createOnboardedUser();
    await seed.createMcpConnection({
      userId: other.userId,
      name: "Other User's App",
    });

    await seed.authenticate(page.context(), owner.email);
    await page.goto("/app/user/account");

    await expect(
      page.getByText("No apps are connected yet.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Other User's App")).toHaveCount(0);
  });

  test("revokes a connection through the confirm dialog, removing it from the list and the database", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const connection = await seed.createMcpConnection({
      userId: user.userId,
      name: "Claude Desktop",
    });

    await seed.authenticate(page.context(), user.email);
    await page.goto("/app/user/account");

    await page.getByRole("button", { name: "Revoke" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Revoke" })
      .click();

    await expect(
      page.getByText("No apps are connected yet.", { exact: true }),
    ).toBeVisible();

    const exists = await seed.mcpConnectionExists({
      clientId: connection.clientId,
      userId: user.userId,
    });
    expect(exists).toBe(false);
  });

  test("cancelling the revoke confirmation dialog leaves the connection intact in the database and UI", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const connection = await seed.createMcpConnection({
      userId: user.userId,
      name: "Claude Desktop",
    });

    await seed.authenticate(page.context(), user.email);
    await page.goto("/app/user/account");

    await page.getByRole("button", { name: "Revoke" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Cancel" })
      .click();

    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(
      page.getByText("Claude Desktop", { exact: true }),
    ).toBeVisible();

    const exists = await seed.mcpConnectionExists({
      clientId: connection.clientId,
      userId: user.userId,
    });
    expect(exists).toBe(true);
  });
});

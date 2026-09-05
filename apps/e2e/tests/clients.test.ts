import { faker } from "@faker-js/faker";
import { test, expect } from "../fixtures";

test.describe("Loading state", () => {
  test("shows a table skeleton while the client list is loading", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();

    await page.route("**/api/clients*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });

    await seed.authenticate(page.context(), user.email);
    await page.goto("/app/user/clients");

    await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
  });
});

test.describe("Listing and searching clients", () => {
  test("lists the caller's own clients with their name and email", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const token = faker.string.uuid();
    const client = await seed.createClient({
      userId: user.userId,
      name: `Acme-${token}`,
      email: `acme-${token}@example.com`,
    });

    await seed.authenticate(page.context(), user.email);
    await page.goto(`/app/user/clients?search=${token}`);

    const row = page.getByRole("row", { name: client.name });
    await expect(row).toBeVisible();
    await expect(row).toContainText(client.email);
  });

  test("filters clients by name via the search input and updates the search URL param", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const token = faker.string.uuid();
    const matching = await seed.createClient({
      userId: user.userId,
      name: `Match-${token}`,
    });
    const nonMatching = await seed.createClient({
      userId: user.userId,
      name: `Other-${faker.string.uuid()}`,
    });

    await seed.authenticate(page.context(), user.email);
    await page.goto("/app/user/clients");

    await page.getByPlaceholder("Search by name").fill(token);
    await expect(page).toHaveURL(/[?&]search=/);

    await expect(page.getByRole("row", { name: matching.name })).toBeVisible();
    await expect(page.getByRole("row", { name: nonMatching.name })).toHaveCount(
      0,
    );
  });

  test("shows the empty-state message when no client matches the search", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();

    await seed.authenticate(page.context(), user.email);
    await page.goto(
      `/app/user/clients?search=${encodeURIComponent(faker.string.uuid())}`,
    );

    await expect(
      page.getByText("No clients match your search.", { exact: true }),
    ).toBeVisible();
  });

  test("paginates clients when more than one page exist for the caller", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const token = faker.string.uuid();

    await Promise.all(
      Array.from({ length: 13 }, (_, index) =>
        seed.createClient({
          userId: user.userId,
          name: `Client-${token}-${index}`,
        }),
      ),
    );

    await seed.authenticate(page.context(), user.email);
    await page.goto(`/app/user/clients?search=${token}`);

    await expect(page.getByRole("row").filter({ hasText: token })).toHaveCount(
      12,
    );

    await page
      .getByRole("navigation", { name: "pagination" })
      .getByText("2", { exact: true })
      .click();

    await expect(page).toHaveURL(/[?&]page=2/);
    await expect(page.getByRole("row").filter({ hasText: token })).toHaveCount(
      1,
    );
  });
});

test.describe("Creating clients", () => {
  test("creates a client through the Add client sheet and persists it scoped to the caller", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const token = faker.string.uuid();
    const name = `Globex-${token}`;
    const email = `globex-${token}@example.com`;

    await seed.authenticate(page.context(), user.email);
    await page.goto("/app/user/clients");

    await page.getByRole("button", { name: "Add client" }).click();

    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("*", { exact: true }).first()).toBeVisible();
    await expect(sheet.getByLabel("Name")).toHaveAttribute("placeholder", /.+/);
    await expect(sheet.getByLabel("Email")).toHaveAttribute(
      "placeholder",
      /.+/,
    );

    await sheet.getByLabel("Name").fill(name);
    await sheet.getByLabel("Email").fill(email);
    await sheet.getByRole("button", { name: "Save" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("row", { name })).toBeVisible();

    const client = await seed.findClientByEmail(email);
    expect(client).not.toBeNull();
    expect(client?.userId).toBe(user.userId);
    expect(client?.name).toBe(name);
  });

  test("rejects submitting the Add client sheet with an empty name and writes nothing", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();

    await seed.authenticate(page.context(), user.email);
    await page.goto("/app/user/clients");

    const before = await seed.countClientsByUser(user.userId);

    await page.getByRole("button", { name: "Add client" }).click();
    await page
      .getByRole("dialog")
      .getByLabel("Email")
      .fill(`empty-name-${faker.string.uuid()}@example.com`);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save" })
      .click();

    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await seed.countClientsByUser(user.userId)).toBe(before);
  });

  test("rejects submitting the Add client sheet with an invalid email and writes nothing", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();

    await seed.authenticate(page.context(), user.email);
    await page.goto("/app/user/clients");

    const before = await seed.countClientsByUser(user.userId);

    await page.getByRole("button", { name: "Add client" }).click();
    await page.getByRole("dialog").getByLabel("Name").fill(`Bad Email Co`);
    await page.getByRole("dialog").getByLabel("Email").fill("not-an-email");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save" })
      .click();

    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await seed.countClientsByUser(user.userId)).toBe(before);
  });
});

test.describe("Editing clients", () => {
  test("updates a client's name and email through the edit sheet's confirm dialog and persists the new values", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const client = await seed.createClient({
      userId: user.userId,
      name: `Before-${faker.string.uuid()}`,
    });
    const newName = `After-${faker.string.uuid()}`;
    const newEmail = `after-${faker.string.uuid()}@example.com`;

    await seed.authenticate(page.context(), user.email);
    await page.goto("/app/user/clients");

    await page
      .getByRole("row", { name: client.name })
      .getByRole("button", { name: "Actions" })
      .click();
    await page.getByRole("menuitem", { name: "Edit" }).click();

    await page.getByRole("dialog").getByLabel("Name").fill(newName);
    await page.getByRole("dialog").getByLabel("Email").fill(newEmail);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save" })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Save" })
      .click();

    await expect(page.getByRole("row", { name: newName })).toBeVisible();
    await expect
      .poll(async () => (await seed.getClient(client.clientId))?.name)
      .toBe(newName);
    expect((await seed.getClient(client.clientId))?.email).toBe(newEmail);
  });

  test("cancelling the edit confirmation dialog leaves the client's details unchanged in the database", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const client = await seed.createClient({
      userId: user.userId,
      name: `Original-${faker.string.uuid()}`,
    });

    await seed.authenticate(page.context(), user.email);
    await page.goto("/app/user/clients");

    await page
      .getByRole("row", { name: client.name })
      .getByRole("button", { name: "Actions" })
      .click();
    await page.getByRole("menuitem", { name: "Edit" }).click();

    await page
      .getByRole("dialog")
      .getByLabel("Name")
      .fill(`Changed-${faker.string.uuid()}`);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save" })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Cancel" })
      .click();

    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    expect(await seed.getClient(client.clientId)).toMatchObject({
      name: client.name,
      email: client.email,
    });
  });
});

test.describe("Removing clients", () => {
  test("cancelling the remove confirmation dialog leaves the client in the database", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const client = await seed.createClient({
      userId: user.userId,
      name: `Keep-${faker.string.uuid()}`,
    });

    await seed.authenticate(page.context(), user.email);
    await page.goto("/app/user/clients");

    await page
      .getByRole("row", { name: client.name })
      .getByRole("button", { name: "Actions" })
      .click();
    await page.getByRole("menuitem", { name: "Remove" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Cancel" })
      .click();

    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.getByRole("row", { name: client.name })).toBeVisible();
    expect(await seed.clientExists(client.clientId)).toBe(true);
  });

  test("removes a client through the remove confirmation dialog and deletes it from the database", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const client = await seed.createClient({
      userId: user.userId,
      name: `Doomed-${faker.string.uuid()}`,
    });

    await seed.authenticate(page.context(), user.email);
    await page.goto("/app/user/clients");

    await page
      .getByRole("row", { name: client.name })
      .getByRole("button", { name: "Actions" })
      .click();
    await page.getByRole("menuitem", { name: "Remove" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Remove" })
      .click();

    await expect(page.getByRole("row", { name: client.name })).toHaveCount(0);
    await expect.poll(() => seed.clientExists(client.clientId)).toBe(false);
  });

  test("removing a client does not affect another client belonging to the same caller", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const doomed = await seed.createClient({
      userId: user.userId,
      name: `Doomed-${faker.string.uuid()}`,
    });
    const survivor = await seed.createClient({
      userId: user.userId,
      name: `Survivor-${faker.string.uuid()}`,
    });

    await seed.authenticate(page.context(), user.email);
    await page.goto("/app/user/clients");

    await page
      .getByRole("row", { name: doomed.name })
      .getByRole("button", { name: "Actions" })
      .click();
    await page.getByRole("menuitem", { name: "Remove" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Remove" })
      .click();

    await expect.poll(() => seed.clientExists(doomed.clientId)).toBe(false);
    expect(await seed.clientExists(survivor.clientId)).toBe(true);
    await expect(page.getByRole("row", { name: survivor.name })).toBeVisible();
  });
});

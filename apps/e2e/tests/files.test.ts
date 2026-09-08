import { faker } from "@faker-js/faker";
import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures";

// File name cells render via `title={name}` and additionally split across two
// sibling <span>s (see FileName), which makes Playwright's computed
// accessible name insert a phantom space at the split point. Locate by the
// title attribute instead so exact-name lookups work.
const fileRow = (page: Page, name: string) =>
  page.getByRole("row").filter({ has: page.getByTitle(name, { exact: true }) });

test.describe("Loading state", () => {
  test("shows a table skeleton while the file list is loading", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();

    await page.route("**/api/files*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });

    await seed.authenticate(page.context(), user.email);
    await page.goto("/app/user/files");

    await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
  });
});

test.describe("Listing and searching files", () => {
  test("lists the caller's own files by name", async ({ page, seed }) => {
    const user = await seed.createOnboardedUser();
    const token = faker.string.uuid();
    const file = await seed.createFile({
      userId: user.userId,
      name: `report-${token}.txt`,
    });

    await seed.authenticate(page.context(), user.email);
    await page.goto(`/app/user/files?search=${token}`);

    await expect(fileRow(page, file.name)).toBeVisible();
  });

  test("filters files by name via the search input and updates the search URL param", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const token = faker.string.uuid();
    const matching = await seed.createFile({
      userId: user.userId,
      name: `match-${token}.txt`,
    });
    const nonMatching = await seed.createFile({
      userId: user.userId,
      name: `other-${faker.string.uuid()}.txt`,
    });

    await seed.authenticate(page.context(), user.email);
    await page.goto("/app/user/files");

    await page.getByPlaceholder("Search by name").fill(token);
    await expect(page).toHaveURL(/[?&]search=/);

    await expect(fileRow(page, matching.name)).toBeVisible();
    await expect(fileRow(page, nonMatching.name)).toHaveCount(0);
  });

  test("shows the empty-state message when no file matches the search", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();

    await seed.authenticate(page.context(), user.email);
    await page.goto(
      `/app/user/files?search=${encodeURIComponent(faker.string.uuid())}`,
    );

    await expect(
      page.getByText("No files match your search.", { exact: true }),
    ).toBeVisible();
  });

  test("paginates files when more than one page exist for the caller", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const token = faker.string.uuid();

    await Promise.all(
      Array.from({ length: 13 }, (_, index) =>
        seed.createFile({
          userId: user.userId,
          name: `file-${token}-${index}.txt`,
        }),
      ),
    );

    await seed.authenticate(page.context(), user.email);
    await page.goto(`/app/user/files?search=${token}`);

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

test.describe("Uploading files", () => {
  test("uploads a file through the upload dialog and lists it once the upload completes", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const fileName = `notes-${faker.string.uuid()}.txt`;

    await seed.authenticate(page.context(), user.email);
    await page.goto("/app/user/files");

    await page.getByRole("button", { name: "Upload files" }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: fileName,
      mimeType: "text/plain",
      buffer: Buffer.from("hello world"),
    });

    await expect
      .poll(
        async () =>
          (await seed.findFileByName({
            userId: user.userId,
            name: fileName,
          })) !== null,
        { timeout: 15_000 },
      )
      .toBe(true);
    await page.getByRole("button", { name: "Done" }).click();

    await expect(fileRow(page, fileName)).toBeVisible();
  });
});

test.describe("Renaming, downloading, and removing files", () => {
  test("renames a file through the rename sheet's confirm dialog and persists the new name", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const file = await seed.createFile({
      userId: user.userId,
      name: `before-${faker.string.uuid()}.txt`,
    });
    const newName = `after-${faker.string.uuid()}.txt`;

    await seed.authenticate(page.context(), user.email);
    await page.goto("/app/user/files");

    await fileRow(page, file.name)
      .getByRole("button", { name: "Actions" })
      .click();
    await page.getByRole("menuitem", { name: "Rename" }).click();

    await page.getByRole("dialog").getByLabel("Name").fill(newName);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save" })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Save" })
      .click();

    await expect(fileRow(page, newName)).toBeVisible();
    await expect
      .poll(async () => (await seed.getFile(file.fileId))?.name)
      .toBe(newName);
  });

  test("downloads a file via the row's Download action and receives it with the original filename", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const file = await seed.createFile({
      userId: user.userId,
      name: `invoice-${faker.string.uuid()}.txt`,
    });

    await seed.authenticate(page.context(), user.email);
    await page.goto("/app/user/files");

    await fileRow(page, file.name)
      .getByRole("button", { name: "Actions" })
      .click();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "Download" }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe(file.name);
  });

  test("removes a file through the remove confirmation dialog and deletes it from the database", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const file = await seed.createFile({
      userId: user.userId,
      name: `delete-${faker.string.uuid()}.txt`,
    });

    await seed.authenticate(page.context(), user.email);
    await page.goto("/app/user/files");

    await fileRow(page, file.name)
      .getByRole("button", { name: "Actions" })
      .click();
    await page.getByRole("menuitem", { name: "Remove" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Remove" })
      .click();

    await expect(fileRow(page, file.name)).toHaveCount(0);
    await expect.poll(() => seed.fileExists(file.fileId)).toBe(false);
  });
});

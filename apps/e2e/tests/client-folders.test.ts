import { faker } from "@faker-js/faker";
import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures";

// Folder/file name cells render via `title={name}`; file names additionally
// split across two sibling <span>s (see FileName), which makes Playwright's
// computed accessible name insert a phantom space at the split point. Locate
// by the title attribute instead so exact-name lookups work for both.
const entryRow = (page: Page, name: string) =>
  page.getByRole("row").filter({ has: page.getByTitle(name, { exact: true }) });

test.describe("Loading state", () => {
  test("shows a table skeleton while a client's folder listing is loading", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const client = await seed.createClient({ userId: user.userId });

    await page.route(
      `**/api/clients/${client.clientId}/entries*`,
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        await route.continue();
      },
    );

    await seed.authenticate(page.context(), user.email);
    await page.goto(`/app/user/clients/${client.clientId}/folders`);

    await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
  });
});

test.describe("Navigating into a client's folders", () => {
  test("clicking a client row navigates to its folders page and shows the client name as the root breadcrumb", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const client = await seed.createClient({
      userId: user.userId,
      name: `E2E Client ${faker.string.uuid()}`,
    });

    await seed.authenticate(page.context(), user.email);
    await page.goto(
      `/app/user/clients?search=${encodeURIComponent(client.name)}`,
    );
    await page.getByRole("row", { name: client.name }).click();

    await expect(page).toHaveURL(
      new RegExp(`/app/user/clients/${client.clientId}/folders`),
    );
    await expect(
      page.getByRole("heading", { name: client.name, level: 1 }),
    ).toBeVisible();

    const breadcrumb = page.getByRole("navigation", { name: "breadcrumb" });
    await expect(
      breadcrumb.getByRole("link", { name: "Clients", exact: true }),
    ).toBeVisible();
    await expect(
      breadcrumb.getByRole("link", { name: client.name, exact: true }),
    ).toBeVisible();
  });

  test("opening a folder row updates the breadcrumb trail with the full parent chain and shows that folder's own entries", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const client = await seed.createClient({ userId: user.userId });
    const folderA = await seed.createFolder({
      clientId: client.clientId,
      userId: user.userId,
      name: `Alpha-${faker.string.uuid()}`,
    });
    const folderB = await seed.createFolder({
      clientId: client.clientId,
      userId: user.userId,
      name: `Beta-${faker.string.uuid()}`,
      parentId: folderA.folderId,
    });
    const file = await seed.createFile({
      clientId: client.clientId,
      userId: user.userId,
      folderId: folderB.folderId,
      name: `notes-${faker.string.uuid()}.txt`,
    });

    await seed.authenticate(page.context(), user.email);
    await page.goto(`/app/user/clients/${client.clientId}/folders`);

    await entryRow(page, folderA.name).click();
    await expect(page).toHaveURL(new RegExp(`parentId=${folderA.folderId}`));

    const breadcrumb = page.getByRole("navigation", { name: "breadcrumb" });
    await expect(
      breadcrumb.getByRole("link", { name: "Clients", exact: true }),
    ).toBeVisible();
    await expect(
      breadcrumb.getByRole("button", { name: client.name, exact: true }),
    ).toBeVisible();
    await expect(
      breadcrumb.getByRole("link", { name: folderA.name, exact: true }),
    ).toBeVisible();

    await entryRow(page, folderB.name).click();
    await expect(page).toHaveURL(new RegExp(`parentId=${folderB.folderId}`));

    await expect(
      breadcrumb.getByRole("button", { name: folderA.name, exact: true }),
    ).toBeVisible();
    await expect(
      breadcrumb.getByRole("link", { name: folderB.name, exact: true }),
    ).toBeVisible();
    await expect(entryRow(page, file.name)).toBeVisible();
  });

  test("clicking an intermediate breadcrumb crumb navigates back up and restores that folder's entries", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const client = await seed.createClient({ userId: user.userId });
    const folderA = await seed.createFolder({
      clientId: client.clientId,
      userId: user.userId,
      name: `Alpha-${faker.string.uuid()}`,
    });
    const folderB = await seed.createFolder({
      clientId: client.clientId,
      userId: user.userId,
      name: `Beta-${faker.string.uuid()}`,
      parentId: folderA.folderId,
    });
    const fileInA = await seed.createFile({
      clientId: client.clientId,
      userId: user.userId,
      folderId: folderA.folderId,
      name: `alpha-file-${faker.string.uuid()}.txt`,
    });

    await seed.authenticate(page.context(), user.email);
    await page.goto(
      `/app/user/clients/${client.clientId}/folders?parentId=${folderB.folderId}`,
    );

    await page
      .getByRole("navigation", { name: "breadcrumb" })
      .getByRole("button", { name: folderA.name, exact: true })
      .click();

    await expect(page).toHaveURL(new RegExp(`parentId=${folderA.folderId}`));
    await expect(entryRow(page, folderB.name)).toBeVisible();
    await expect(entryRow(page, fileInA.name)).toBeVisible();
  });

  test("clicking the client-name breadcrumb crumb navigates back to the root and clears the open folder", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const client = await seed.createClient({ userId: user.userId });
    const rootFolder = await seed.createFolder({
      clientId: client.clientId,
      userId: user.userId,
      name: `Root-${faker.string.uuid()}`,
    });
    const subFolder = await seed.createFolder({
      clientId: client.clientId,
      userId: user.userId,
      name: `Sub-${faker.string.uuid()}`,
      parentId: rootFolder.folderId,
    });

    await seed.authenticate(page.context(), user.email);
    await page.goto(
      `/app/user/clients/${client.clientId}/folders?parentId=${subFolder.folderId}`,
    );

    await page
      .getByRole("navigation", { name: "breadcrumb" })
      .getByRole("button", { name: client.name, exact: true })
      .click();

    await expect(entryRow(page, rootFolder.name)).toBeVisible();
    await expect
      .poll(() => new URL(page.url()).searchParams.has("parentId"))
      .toBe(false);
  });

  test("shows the empty-state message when a folder has no entries", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const client = await seed.createClient({ userId: user.userId });

    await seed.authenticate(page.context(), user.email);
    await page.goto(`/app/user/clients/${client.clientId}/folders`);

    await expect(
      page.getByText("This folder is empty.", { exact: true }),
    ).toBeVisible();
  });

  test("rejects opening another user's client folders page via direct URL and shows a 404 error screen", async ({
    page,
    seed,
  }) => {
    const owner = await seed.createOnboardedUser();
    const intruder = await seed.createOnboardedUser();
    const client = await seed.createClient({ userId: owner.userId });

    await seed.authenticate(page.context(), intruder.email);
    await page.goto(`/app/user/clients/${client.clientId}/folders`);

    // TanStack Query's default retry (3 attempts, exponential backoff) delays
    // the 404 from surfacing well past the default 5s assertion timeout.
    await expect(page.getByRole("heading", { name: /^404/ })).toBeVisible({
      timeout: 15_000,
    });
  });
});

test.describe("Creating and editing folders", () => {
  test("creates a root folder through the Add folder sheet and persists it scoped to the client and parent", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const client = await seed.createClient({ userId: user.userId });
    const name = `Contracts-${faker.string.uuid()}`;

    await seed.authenticate(page.context(), user.email);
    await page.goto(`/app/user/clients/${client.clientId}/folders`);

    await page.getByRole("button", { name: "Add folder" }).click();

    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("*", { exact: true })).toBeVisible();
    await expect(sheet.getByLabel("Name")).toHaveAttribute("placeholder", /.+/);

    await sheet.getByLabel("Name").fill(name);
    await sheet.getByRole("button", { name: "Save" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(entryRow(page, name)).toBeVisible();

    const folder = await seed.findFolderByName({
      clientId: client.clientId,
      parentId: null,
      name,
    });
    expect(folder).not.toBeNull();
    expect(folder?.clientId).toBe(client.clientId);
    expect(folder?.parentId).toBeNull();
  });

  test("creates a nested folder while inside another folder and persists the correct parentId", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const client = await seed.createClient({ userId: user.userId });
    const parent = await seed.createFolder({
      clientId: client.clientId,
      userId: user.userId,
      name: `Parent-${faker.string.uuid()}`,
    });
    const name = `Nested-${faker.string.uuid()}`;

    await seed.authenticate(page.context(), user.email);
    await page.goto(
      `/app/user/clients/${client.clientId}/folders?parentId=${parent.folderId}`,
    );

    await page.getByRole("button", { name: "Add folder" }).click();
    await page.getByRole("dialog").getByLabel("Name").fill(name);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save" })
      .click();

    await expect(entryRow(page, name)).toBeVisible();

    const folder = await seed.findFolderByName({
      clientId: client.clientId,
      parentId: parent.folderId,
      name,
    });
    expect(folder).not.toBeNull();
    expect(folder?.parentId).toBe(parent.folderId);
  });

  test("rejects submitting the Add folder sheet with an empty name and writes nothing", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const client = await seed.createClient({ userId: user.userId });

    await seed.authenticate(page.context(), user.email);
    await page.goto(`/app/user/clients/${client.clientId}/folders`);

    await page.getByRole("button", { name: "Add folder" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save" })
      .click();

    await expect(page.getByRole("dialog")).toBeVisible();
    expect(await seed.countFoldersByClient(client.clientId)).toBe(0);
  });

  test("renames a folder through the edit sheet's confirm dialog and persists the new name", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const client = await seed.createClient({ userId: user.userId });
    const folder = await seed.createFolder({
      clientId: client.clientId,
      userId: user.userId,
      name: `Before-${faker.string.uuid()}`,
    });
    const newName = `After-${faker.string.uuid()}`;

    await seed.authenticate(page.context(), user.email);
    await page.goto(`/app/user/clients/${client.clientId}/folders`);

    await entryRow(page, folder.name)
      .getByRole("button", { name: "Actions" })
      .click();
    await page.getByRole("menuitem", { name: "Edit" }).click();

    await page.getByRole("dialog").getByLabel("Name").fill(newName);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save" })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Save" })
      .click();

    await expect(entryRow(page, newName)).toBeVisible();
    await expect
      .poll(async () => (await seed.getFolder(folder.folderId))?.name)
      .toBe(newName);
  });

  test("cancelling the rename confirmation dialog leaves the folder's name unchanged in the database", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const client = await seed.createClient({ userId: user.userId });
    const folder = await seed.createFolder({
      clientId: client.clientId,
      userId: user.userId,
      name: `Original-${faker.string.uuid()}`,
    });

    await seed.authenticate(page.context(), user.email);
    await page.goto(`/app/user/clients/${client.clientId}/folders`);

    await entryRow(page, folder.name)
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
    expect(await seed.getFolder(folder.folderId)).toMatchObject({
      name: folder.name,
    });
  });
});

test.describe("Duplicate and long folder names", () => {
  test("allows creating two folders with the same name in the same location and persists both as separate rows", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const client = await seed.createClient({ userId: user.userId });
    const name = `Duplicate-${faker.string.uuid()}`;

    await seed.authenticate(page.context(), user.email);
    await page.goto(`/app/user/clients/${client.clientId}/folders`);

    await page.getByRole("button", { name: "Add folder" }).click();
    await page.getByRole("dialog").getByLabel("Name").fill(name);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save" })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "Add folder" }).click();
    await page.getByRole("dialog").getByLabel("Name").fill(name);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save" })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await expect(entryRow(page, name)).toHaveCount(2);
    expect(await seed.countFoldersByClient(client.clientId)).toBe(2);
  });

  test("preserves the full name of a long folder name via its title attribute even though the row visually truncates it", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const client = await seed.createClient({ userId: user.userId });
    const longName = `Very-Long-Folder-Name-That-Should-Visually-Truncate-In-The-Table-${faker.string.uuid()}`;
    await seed.createFolder({
      clientId: client.clientId,
      userId: user.userId,
      name: longName,
    });

    await seed.authenticate(page.context(), user.email);
    await page.goto(`/app/user/clients/${client.clientId}/folders`);

    const nameSpan = entryRow(page, longName).locator("span[title]").first();

    await expect(nameSpan).toHaveAttribute("title", longName);
    await expect(nameSpan).toHaveClass(/truncate/);
  });
});

test.describe("Removing folders", () => {
  test("cancelling the remove confirmation dialog leaves the folder and its contents in the database", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const client = await seed.createClient({ userId: user.userId });
    const folder = await seed.createFolder({
      clientId: client.clientId,
      userId: user.userId,
      name: `Keep-${faker.string.uuid()}`,
    });
    const subfolder = await seed.createFolder({
      clientId: client.clientId,
      userId: user.userId,
      name: `KeepChild-${faker.string.uuid()}`,
      parentId: folder.folderId,
    });
    const file = await seed.createFile({
      clientId: client.clientId,
      userId: user.userId,
      folderId: folder.folderId,
      name: `keep-${faker.string.uuid()}.txt`,
    });

    await seed.authenticate(page.context(), user.email);
    await page.goto(`/app/user/clients/${client.clientId}/folders`);

    await entryRow(page, folder.name)
      .getByRole("button", { name: "Actions" })
      .click();
    await page.getByRole("menuitem", { name: "Remove" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Cancel" })
      .click();

    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(entryRow(page, folder.name)).toBeVisible();

    expect(await seed.folderExists(folder.folderId)).toBe(true);
    expect(await seed.folderExists(subfolder.folderId)).toBe(true);
    expect(await seed.fileExists(file.fileId)).toBe(true);
  });

  test("removing a folder deletes it and cascades to its nested subfolder and file", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const client = await seed.createClient({ userId: user.userId });
    const folder = await seed.createFolder({
      clientId: client.clientId,
      userId: user.userId,
      name: `Doomed-${faker.string.uuid()}`,
    });
    const subfolder = await seed.createFolder({
      clientId: client.clientId,
      userId: user.userId,
      name: `DoomedChild-${faker.string.uuid()}`,
      parentId: folder.folderId,
    });
    const file = await seed.createFile({
      clientId: client.clientId,
      userId: user.userId,
      folderId: folder.folderId,
      name: `doomed-${faker.string.uuid()}.txt`,
    });

    await seed.authenticate(page.context(), user.email);
    await page.goto(`/app/user/clients/${client.clientId}/folders`);

    await entryRow(page, folder.name)
      .getByRole("button", { name: "Actions" })
      .click();
    await page.getByRole("menuitem", { name: "Remove" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Remove" })
      .click();

    await expect(entryRow(page, folder.name)).toHaveCount(0);

    await expect.poll(() => seed.folderExists(folder.folderId)).toBe(false);
    expect(await seed.folderExists(subfolder.folderId)).toBe(false);
    expect(await seed.fileExists(file.fileId)).toBe(false);
  });
});

test.describe("Searching, filtering, and pagination", () => {
  test("filters entries by name via the search input and updates the search URL param", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const client = await seed.createClient({ userId: user.userId });
    const token = faker.string.uuid();
    const matching = await seed.createFolder({
      clientId: client.clientId,
      userId: user.userId,
      name: `Match-${token}`,
    });
    const nonMatching = await seed.createFolder({
      clientId: client.clientId,
      userId: user.userId,
      name: `Other-${faker.string.uuid()}`,
    });

    await seed.authenticate(page.context(), user.email);
    await page.goto(`/app/user/clients/${client.clientId}/folders`);

    await page.getByPlaceholder("Search by name").fill(token);
    await expect(page).toHaveURL(/[?&]search=/);

    await expect(entryRow(page, matching.name)).toBeVisible();
    await expect(entryRow(page, nonMatching.name)).toHaveCount(0);
  });

  test("searching within a subfolder scopes matches to that folder only", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const client = await seed.createClient({ userId: user.userId });
    const token = faker.string.uuid();
    const parent = await seed.createFolder({
      clientId: client.clientId,
      userId: user.userId,
      name: `Parent-${faker.string.uuid()}`,
    });
    const matchingChild = await seed.createFolder({
      clientId: client.clientId,
      userId: user.userId,
      name: `MatchChild-${token}`,
      parentId: parent.folderId,
    });
    const nonMatchingChild = await seed.createFolder({
      clientId: client.clientId,
      userId: user.userId,
      name: `NoMatch-${faker.string.uuid()}`,
      parentId: parent.folderId,
    });
    const matchingRootSibling = await seed.createFolder({
      clientId: client.clientId,
      userId: user.userId,
      name: `MatchRoot-${token}`,
    });

    await seed.authenticate(page.context(), user.email);
    await page.goto(
      `/app/user/clients/${client.clientId}/folders?parentId=${parent.folderId}`,
    );

    await page.getByPlaceholder("Search by name").fill(token);
    await expect(page).toHaveURL(/[?&]search=/);

    await expect(entryRow(page, matchingChild.name)).toBeVisible();
    await expect(entryRow(page, nonMatchingChild.name)).toHaveCount(0);
    await expect(entryRow(page, matchingRootSibling.name)).toHaveCount(0);
  });

  test("paginates entries when more than one page of folders exist for the client", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const client = await seed.createClient({ userId: user.userId });
    const token = faker.string.uuid();

    await Promise.all(
      Array.from({ length: 13 }, (_, index) =>
        seed.createFolder({
          clientId: client.clientId,
          userId: user.userId,
          name: `Folder-${token}-${index}`,
        }),
      ),
    );

    await seed.authenticate(page.context(), user.email);
    await page.goto(
      `/app/user/clients/${client.clientId}/folders?search=${token}`,
    );

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
  test("uploads a file through the upload dialog and it appears in the entries table with its real persisted size", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const client = await seed.createClient({ userId: user.userId });
    const fileName = `notes-${faker.string.uuid()}.txt`;
    const content = "hello world";

    await seed.authenticate(page.context(), user.email);
    await page.goto(`/app/user/clients/${client.clientId}/folders`);

    await page.getByRole("button", { name: "Upload files" }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: fileName,
      mimeType: "text/plain",
      buffer: Buffer.from(content),
    });

    await expect
      .poll(
        async () =>
          (await seed.findFileByName({
            clientId: client.clientId,
            folderId: null,
            name: fileName,
          })) !== null,
        { timeout: 15_000 },
      )
      .toBe(true);

    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const row = entryRow(page, fileName);
    await expect(row).toBeVisible();
    await expect(row).toContainText(`${content.length} B`);

    const file = await seed.findFileByName({
      clientId: client.clientId,
      folderId: null,
      name: fileName,
    });
    expect(file?.sizeBytes).toBe(content.length);
    // The browser normalizes a bare "text/plain" File type to include a
    // charset when it's actually sent over the wire.
    expect(file?.mimeType).toMatch(/^text\/plain/);
  });

  test("silently skips a disallowed-extension file dropped into the uploader", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const client = await seed.createClient({ userId: user.userId });
    const fileName = `binary-${faker.string.uuid()}.exe`;

    await seed.authenticate(page.context(), user.email);
    await page.goto(`/app/user/clients/${client.clientId}/folders`);

    await page.getByRole("button", { name: "Upload files" }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: fileName,
      mimeType: "application/octet-stream",
      buffer: Buffer.from("not a document"),
    });

    await expect(
      page.getByRole("list", { name: "Files being uploaded" }),
    ).toHaveCount(0);
    expect(await seed.countFilesByClient(client.clientId)).toBe(0);
  });

  test("auto-suffixes the name when uploading a second file with the same name into the same folder", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const client = await seed.createClient({ userId: user.userId });
    const fileName = `report-${faker.string.uuid()}.txt`;
    const suffixedName = fileName.replace(/\.txt$/, " (1).txt");

    await seed.authenticate(page.context(), user.email);
    await page.goto(`/app/user/clients/${client.clientId}/folders`);

    await page.getByRole("button", { name: "Upload files" }).click();
    const input = page.locator('input[type="file"]');

    await input.setInputFiles({
      name: fileName,
      mimeType: "text/plain",
      buffer: Buffer.from("first version"),
    });
    await expect
      .poll(
        async () =>
          (await seed.findFileByName({
            clientId: client.clientId,
            folderId: null,
            name: fileName,
          })) !== null,
        { timeout: 15_000 },
      )
      .toBe(true);

    await input.setInputFiles({
      name: fileName,
      mimeType: "text/plain",
      buffer: Buffer.from("second version, different bytes"),
    });
    await expect
      .poll(
        async () =>
          (await seed.findFileByName({
            clientId: client.clientId,
            folderId: null,
            name: suffixedName,
          })) !== null,
        { timeout: 15_000 },
      )
      .toBe(true);

    await page.getByRole("button", { name: "Done" }).click();

    await expect(entryRow(page, fileName)).toBeVisible();
    await expect(entryRow(page, suffixedName)).toBeVisible();
  });

  test("removing a queued (not-yet-uploaded) item from the upload list does not create a file record", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const client = await seed.createClient({ userId: user.userId });
    const fileName = `cancelled-${faker.string.uuid()}.txt`;

    await seed.authenticate(page.context(), user.email);
    await page.goto(`/app/user/clients/${client.clientId}/folders`);

    await page.getByRole("button", { name: "Upload files" }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: fileName,
      mimeType: "text/plain",
      buffer: Buffer.from("will be cancelled"),
    });

    await page.getByRole("button", { name: `Remove ${fileName}` }).click();

    await expect(page.getByRole("listitem")).toHaveCount(0);

    // If the upload wins the race against the click, removing a "done" item
    // falls back to an actual DELETE request — give that round-trip room.
    await expect
      .poll(
        () =>
          seed.findFileByName({
            clientId: client.clientId,
            folderId: null,
            name: fileName,
          }),
        { timeout: 10_000 },
      )
      .toBeNull();

    expect(await seed.countFilesByClient(client.clientId)).toBe(0);
  });
});

test.describe("Renaming, downloading, and removing files", () => {
  test("renames a file through the rename sheet's confirm dialog and persists the new name", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const client = await seed.createClient({ userId: user.userId });
    const file = await seed.createFile({
      clientId: client.clientId,
      userId: user.userId,
      name: `before-${faker.string.uuid()}.txt`,
    });
    const newName = `after-${faker.string.uuid()}.txt`;

    await seed.authenticate(page.context(), user.email);
    await page.goto(`/app/user/clients/${client.clientId}/folders`);

    await entryRow(page, file.name)
      .getByRole("button", { name: "Actions" })
      .click();
    await page.getByRole("menuitem", { name: "Edit" }).click();

    await page.getByRole("dialog").getByLabel("Name").fill(newName);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save" })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Save" })
      .click();

    await expect(entryRow(page, newName)).toBeVisible();
    await expect
      .poll(async () => (await seed.getFile(file.fileId))?.name)
      .toBe(newName);
  });

  test("downloads a file via the row's Download action and receives it with the original filename", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const client = await seed.createClient({ userId: user.userId });
    const fileName = `invoice-${faker.string.uuid()}.txt`;

    await seed.authenticate(page.context(), user.email);
    await page.goto(`/app/user/clients/${client.clientId}/folders`);

    await page.getByRole("button", { name: "Upload files" }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: fileName,
      mimeType: "text/plain",
      buffer: Buffer.from("invoice contents"),
    });
    await expect
      .poll(
        async () =>
          (await seed.findFileByName({
            clientId: client.clientId,
            folderId: null,
            name: fileName,
          })) !== null,
        { timeout: 15_000 },
      )
      .toBe(true);
    await page.getByRole("button", { name: "Done" }).click();

    await entryRow(page, fileName)
      .getByRole("button", { name: "Actions" })
      .click();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "Download" }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe(fileName);
  });

  test("opening a file row directly opens its raw file URL in a new tab", async ({
    page,
    context,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const client = await seed.createClient({ userId: user.userId });
    const file = await seed.createFile({
      clientId: client.clientId,
      userId: user.userId,
      name: `doc-${faker.string.uuid()}.txt`,
    });

    await seed.authenticate(page.context(), user.email);
    await page.goto(`/app/user/clients/${client.clientId}/folders`);

    // The seeded file's URL points at a non-resolving test domain, so letting
    // the new tab's navigation actually run would fail and Chromium would
    // replace its URL with an internal chrome-error:// page. Intercept the
    // request instead of racing a "page"/"request" event listener against it.
    let requestedUrl: string | undefined;
    await context.route("https://storage.test/**", async (route) => {
      requestedUrl = route.request().url();
      await route.abort();
    });

    await entryRow(page, file.name).click();

    const stored = await seed.getFile(file.fileId);
    await expect.poll(() => requestedUrl).toBe(stored?.url);
  });

  test("removes a file through the remove confirmation dialog and deletes it from the database", async ({
    page,
    seed,
  }) => {
    const user = await seed.createOnboardedUser();
    const client = await seed.createClient({ userId: user.userId });
    const file = await seed.createFile({
      clientId: client.clientId,
      userId: user.userId,
      name: `delete-${faker.string.uuid()}.txt`,
    });

    await seed.authenticate(page.context(), user.email);
    await page.goto(`/app/user/clients/${client.clientId}/folders`);

    await entryRow(page, file.name)
      .getByRole("button", { name: "Actions" })
      .click();
    await page.getByRole("menuitem", { name: "Remove" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Remove" })
      .click();

    await expect(entryRow(page, file.name)).toHaveCount(0);
    await expect.poll(() => seed.fileExists(file.fileId)).toBe(false);
  });
});

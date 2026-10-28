import { test, expect } from "../fixtures";
import { API_URL } from "../config";
import { expectRequired, field, rowActions, token } from "./support";

test("creates a lead from the form and stores every field", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const username = `lead-${id}`;

  await page.goto("/admin/leads/new");

  await expectRequired(page, "Name", "Jane Doe");
  await expectRequired(page, "Username", "jane-doe");
  await expectRequired(
    page,
    "Skool profile link",
    "https://www.skool.com/@jane-doe",
  );

  await field(page, "Name").fill(`Lead ${id}`);
  await page.getByLabel("Username").fill(username);
  // Typing the username fills the link until the link is edited by hand
  await expect(page.getByLabel("Skool profile link")).toHaveValue(
    `https://www.skool.com/@${username}`,
  );
  await page.getByLabel("Bio").fill("Coach for new founders");
  await page.getByLabel("Email").fill(`${id}@example.com`);
  await page.getByLabel("Instagram").fill(`https://instagram.com/${id}`);
  await page.getByLabel("Facebook").fill(`https://facebook.com/${id}`);
  await page.getByLabel("LinkedIn").fill(`https://linkedin.com/in/${id}`);
  await page.getByLabel("Website").fill(`https://${id}.example.com`);
  await page.getByRole("button", { name: "Save lead" }).click();

  await expect(page).toHaveURL(/\/admin\/leads\/\d+$/);
  await expect(page.getByRole("heading", { name: `Lead ${id}` })).toBeVisible();

  const stored = await seed.findLeadByUsername(username);
  expect(stored).toMatchObject({
    name: `Lead ${id}`,
    username,
    skoolUrl: `https://www.skool.com/@${username}`,
    bio: "Coach for new founders",
    email: `${id}@example.com`,
    instagram: `https://instagram.com/${id}`,
    facebook: `https://facebook.com/${id}`,
    linkedin: `https://linkedin.com/in/${id}`,
    website: `https://${id}.example.com`,
  });
});

test("an edited Skool link stops following the username", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();

  await page.goto("/admin/leads/new");
  await page.getByLabel("Username").fill(`first-${id}`);
  await page
    .getByLabel("Skool profile link")
    .fill(`https://www.skool.com/@custom-${id}`);
  await page.getByLabel("Username").fill(`second-${id}`);

  await expect(page.getByLabel("Skool profile link")).toHaveValue(
    `https://www.skool.com/@custom-${id}`,
  );
});

test("refuses invalid input and creates no lead", async ({ page, seed }) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();

  await page.goto("/admin/leads/new");
  await field(page, "Name").fill(`Lead ${id}`);
  await page.getByLabel("Username").fill(`lead-${id}`);
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByLabel("Website").fill("not a link");
  await page.getByRole("button", { name: "Save lead" }).click();

  await expect(page).toHaveURL(/\/admin\/leads\/new$/);
  await expect(page.getByLabel("Email")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByLabel("Website")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(await seed.findLeadByUsername(`lead-${id}`)).toBeNull();
});

test("a username that is already taken creates nothing and keeps the original", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  await seed.createLead({ name: `Original ${id}`, username: `taken-${id}` });

  await page.goto("/admin/leads/new");
  await field(page, "Name").fill(`Impostor ${id}`);
  await page.getByLabel("Username").fill(`taken-${id}`);
  await page
    .getByLabel("Skool profile link")
    .fill(`https://www.skool.com/@other-${id}`);
  await page.getByRole("button", { name: "Save lead" }).click();

  await expect(page).toHaveURL(/\/admin\/leads\/new$/);
  await expect(page.getByRole("button", { name: "Save lead" })).toBeEnabled();
  expect(await seed.countLeadsWithPrefix(`taken-${id}`)).toBe(1);
  expect(await seed.findLeadByUsername(`taken-${id}`)).toMatchObject({
    name: `Original ${id}`,
  });
  expect(await seed.findLeadByUsername(`other-${id}`)).toBeNull();
});

test("shows a skeleton while the leads load", async ({ page, seed }) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  await seed.createLead({ name: `Slow ${id}`, username: `slow-${id}` });

  await page.route(
    (url) => url.pathname === "/api/leads",
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.continue();
    },
  );
  await page.goto(`/admin/leads?search=${id}`);

  await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible();
  await expect(page.getByRole("link", { name: `Slow ${id}` })).toBeVisible();
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
});

test("pages through leads with the chosen page size", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  await seed.createLeads({ prefix: `page-${id}`, count: 25 });
  const rows = page.locator("tbody tr");
  const pagination = page.getByRole("navigation", { name: "pagination" });
  const pageSize = page.getByRole("combobox", { name: "Rows per page" });

  await page.goto(`/admin/leads?search=${id}`);

  await expect(page.getByText("25 leads", { exact: true })).toBeVisible();
  await expect(rows).toHaveCount(20);

  await pageSize.click();
  await page.getByRole("option", { name: "10 per page" }).click();
  await expect(page).toHaveURL(/perPage=10/);
  await expect(rows).toHaveCount(10);

  await pagination.getByRole("button", { name: "3", exact: true }).click();
  await expect(page).toHaveURL(/page=3/);
  await expect(rows).toHaveCount(5);
  await expect(
    pagination.getByRole("button", { name: "Go to next page" }),
  ).toBeDisabled();

  // A new size starts over from the first page
  await pageSize.click();
  await page.getByRole("option", { name: "50 per page" }).click();
  await expect(page).not.toHaveURL(/page=3/);
  await expect(page).toHaveURL(/perPage=50/);
  await expect(rows).toHaveCount(25);
  await expect(
    pagination.getByRole("button", { name: "Go to previous page" }),
  ).toBeDisabled();
});

test("a search with no matches offers to clear the filters", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();

  await page.goto(`/admin/leads?search=nobody-${id}`);

  await expect(page.getByText("No leads match")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).not.toHaveURL(/search=/);
  await expect(page.getByText("No leads match")).toHaveCount(0);
});

test("edits a lead and keeps what was not changed", async ({ page, seed }) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const lead = await seed.createLead({
    name: `Before ${id}`,
    username: `edit-${id}`,
    email: `edit-${id}@example.com`,
    bio: "Keep this bio",
  });

  await page.goto(`/admin/leads/${lead.leadId}/edit`);
  await expect(field(page, "Name")).toHaveValue(`Before ${id}`);
  await field(page, "Name").fill(`After ${id}`);
  await page.getByLabel("Email").fill("");
  await page.getByRole("button", { name: "Save lead" }).click();

  await expect(page).toHaveURL(new RegExp(`/admin/leads/${lead.leadId}$`));
  await expect(
    page.getByRole("heading", { name: `After ${id}` }),
  ).toBeVisible();
  expect(await seed.findLeadByUsername(`edit-${id}`)).toMatchObject({
    name: `After ${id}`,
    email: null,
    bio: "Keep this bio",
    skoolUrl: `https://www.skool.com/@edit-${id}`,
  });
});

test("deleting a lead from its row removes the lead and its communities", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const lead = await seed.createLead({
    name: `Doomed ${id}`,
    username: `doomed-${id}`,
  });
  await seed.createCommunity({
    leadId: lead.leadId,
    name: `Doomed community ${id}`,
    slug: `doomed-community-${id}`,
  });
  const survivor = await seed.createLead({
    name: `Survivor ${id}`,
    username: `survivor-${id}`,
  });

  await page.goto(`/admin/leads?search=${id}`);
  await rowActions(page, `Doomed ${id}`).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("1 community");
  await dialog.getByRole("button", { name: "Delete" }).click();

  await expect(page.getByRole("link", { name: `Doomed ${id}` })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: `Survivor ${id}` }),
  ).toBeVisible();
  expect(await seed.findLeadByUsername(`doomed-${id}`)).toBeNull();
  expect(await seed.findCommunityBySlug(`doomed-community-${id}`)).toBeNull();
  expect(await seed.findLeadByUsername(`survivor-${id}`)).toMatchObject({
    leadId: survivor.leadId,
  });
});

test("bulk deletes the selected leads only after confirmation", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const prefix = `bulk-${id}`;
  await seed.createLeads({ prefix, count: 4 });
  const firstLead = await seed.findLeadByUsername(`${prefix}-01`);
  if (!firstLead) throw new Error("the seeded lead is missing");
  await seed.createCommunity({
    leadId: firstLead.leadId,
    name: `Goes with lead ${id}`,
    slug: `bulk-community-${id}`,
  });

  await page.goto(`/admin/leads?search=${id}`);
  await expect(page.locator("tbody tr")).toHaveCount(4);
  for (const number of ["01", "02", "03"]) {
    await page
      .getByRole("checkbox", { name: `Select ${prefix} ${number}` })
      .check();
  }
  await expect(page.getByText("3 selected")).toBeVisible();

  await page.getByRole("button", { name: "Delete 3 leads" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Delete 3 leads?" });
  await expect(dialog).toContainText("3 leads and their 1 community");

  // Cancelling deletes nothing
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect(await seed.countLeadsWithPrefix(prefix)).toBe(4);

  await page.getByRole("button", { name: "Delete 3 leads" }).click();
  await page
    .getByRole("alertdialog", { name: "Delete 3 leads?" })
    .getByRole("button", { name: "Delete" })
    .click();

  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.getByText("3 selected")).toHaveCount(0);
  expect(await seed.countLeadsWithPrefix(prefix)).toBe(1);
  expect(await seed.findLeadByUsername(`${prefix}-04`)).not.toBeNull();
  expect(await seed.findCommunityBySlug(`bulk-community-${id}`)).toBeNull();
});

test("a non-admin cannot bulk delete leads", async ({ page, seed }) => {
  const member = await seed.createVerifiedMember();
  await seed.authenticate(page.context(), member.email);
  const id = token();
  const lead = await seed.createLead({
    name: `Protected ${id}`,
    username: `protected-${id}`,
  });

  const response = await page.request.post(`${API_URL}/api/leads/bulk-delete`, {
    data: { leadIds: [lead.leadId] },
  });

  expect(response.status()).toBe(403);
  expect(await seed.findLeadByUsername(`protected-${id}`)).not.toBeNull();
});

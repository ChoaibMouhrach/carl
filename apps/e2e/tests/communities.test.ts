import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures";
import { API_URL } from "../config";
import { expectRequired, field, rowActions, token } from "./support";

const pickOwner = async (page: Page, name: string) => {
  await page.getByRole("combobox", { name: "Owner" }).fill(name);
  await page.getByRole("option", { name: new RegExp(name) }).click();
};

test("creates a paid community from the form and stores the price", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const lead = await seed.createLead({
    name: `Owner ${id}`,
    username: `owner-${id}`,
  });

  await page.goto("/admin/communities/new");
  await page.getByRole("button", { name: "Paid" }).click();

  await expectRequired(page, "Owner");
  await expectRequired(page, "Name", "My Community");
  await expectRequired(
    page,
    "Skool link",
    "https://www.skool.com/my-community",
  );
  await expectRequired(page, "Price", "49");
  await expectRequired(page, "Currency", "USD");
  await expectRequired(page, "Billed");

  await pickOwner(page, `Owner ${id}`);
  await field(page, "Name").fill(`Community ${id}`);
  await page
    .getByLabel("Skool link")
    .fill(`https://www.skool.com/community-${id}`);
  await page.getByLabel("Description").fill("Weekly coaching calls");
  await page.getByLabel("Contact email").fill(`hello-${id}@example.com`);
  await field(page, "Price").fill("49");
  await field(page, "Members").fill("120");
  // Members x monthly price is offered as the revenue estimate
  await page.getByRole("button", { name: /^Use \$5,880/ }).click();
  await expect(field(page, "MRR")).toHaveValue("5880");
  await page.getByRole("button", { name: "Save community" }).click();

  await expect(page).toHaveURL(/\/admin\/communities(\?|$)/);
  expect(await seed.findCommunityBySlug(`community-${id}`)).toMatchObject({
    leadId: lead.leadId,
    name: `Community ${id}`,
    description: "Weekly coaching calls",
    email: `hello-${id}@example.com`,
    members: 120,
    mrr: 5880,
    isFree: false,
    priceCents: 4900,
    priceCurrency: "usd",
    priceInterval: "month",
  });
});

test("a free community has no price fields and stores no price", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  await seed.createLead({ name: `Owner ${id}`, username: `owner-${id}` });

  await page.goto("/admin/communities/new");
  await page.getByRole("button", { name: "Paid" }).click();
  await field(page, "Price").fill("49");
  await page.getByRole("button", { name: "Free" }).click();
  await expect(field(page, "Price")).toHaveCount(0);
  await expect(page.getByLabel("Currency")).toHaveCount(0);

  await pickOwner(page, `Owner ${id}`);
  await field(page, "Name").fill(`Free ${id}`);
  await page.getByLabel("Skool link").fill(`https://www.skool.com/free-${id}`);
  await page.getByRole("button", { name: "Save community" }).click();

  await expect(page).toHaveURL(/\/admin\/communities(\?|$)/);
  expect(await seed.findCommunityBySlug(`free-${id}`)).toMatchObject({
    isFree: true,
    priceCents: null,
    priceCurrency: null,
    priceInterval: null,
  });
});

test("refuses a community without an owner or with a link outside Skool", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  await seed.createLead({ name: `Owner ${id}`, username: `owner-${id}` });

  await page.goto("/admin/communities/new");
  await field(page, "Name").fill(`Nope ${id}`);
  await page.getByLabel("Skool link").fill(`https://example.com/nope-${id}`);
  await page.getByRole("button", { name: "Save community" }).click();

  await expect(page).toHaveURL(/\/admin\/communities\/new$/);
  await expect(page.getByLabel("Skool link")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(await seed.findCommunityBySlug(`nope-${id}`)).toBeNull();

  // With a valid link but still no owner, nothing is created either
  await page.getByLabel("Skool link").fill(`https://www.skool.com/nope-${id}`);
  await page.getByRole("button", { name: "Save community" }).click();
  await expect(page).toHaveURL(/\/admin\/communities\/new$/);
  expect(await seed.findCommunityBySlug(`nope-${id}`)).toBeNull();
});

test("a taken Skool link creates nothing", async ({ page, seed }) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const lead = await seed.createLead({
    name: `Owner ${id}`,
    username: `owner-${id}`,
  });
  await seed.createCommunity({
    leadId: lead.leadId,
    name: `Original ${id}`,
    slug: `taken-${id}`,
  });

  await page.goto("/admin/communities/new");
  await pickOwner(page, `Owner ${id}`);
  await field(page, "Name").fill(`Copy ${id}`);
  await page.getByLabel("Skool link").fill(`https://www.skool.com/taken-${id}`);
  await page.getByRole("button", { name: "Save community" }).click();

  await expect(page).toHaveURL(/\/admin\/communities\/new$/);
  await expect(
    page.getByRole("button", { name: "Save community" }),
  ).toBeEnabled();
  expect(await seed.countCommunitiesWithPrefix(`taken-${id}`)).toBe(1);
  expect(await seed.findCommunityBySlug(`taken-${id}`)).toMatchObject({
    name: `Original ${id}`,
  });
});

test("shows a skeleton while the communities load", async ({ page, seed }) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const lead = await seed.createLead({
    name: `Owner ${id}`,
    username: `owner-${id}`,
  });
  await seed.createCommunity({
    leadId: lead.leadId,
    name: `Slow ${id}`,
    slug: `slow-${id}`,
  });

  await page.route(
    (url) => url.pathname === "/api/communities",
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.continue();
    },
  );
  await page.goto(`/admin/communities?search=${id}`);

  await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Slow ${id}`, exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
});

test("filters by pricing, members and sorts, with removable chips", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const lead = await seed.createLead({
    name: `Owner ${id}`,
    username: `owner-${id}`,
  });
  const make = (slug: string, members: number, priceCents?: number) =>
    seed.createCommunity({
      leadId: lead.leadId,
      name: `${slug} ${id}`,
      slug: `${slug}-${id}`,
      members,
      priceCents,
    });
  await make("small-free", 10);
  await make("mid-paid", 200, 4900);
  await make("big-paid", 5000, 4900);
  const rows = page.locator("tbody tr");
  const row = (slug: string) => rows.filter({ hasText: `${slug} ${id}` });

  await page.goto(`/admin/communities?search=${id}`);
  await expect(rows).toHaveCount(3);

  await page.getByRole("combobox", { name: "Pricing" }).click();
  await page.getByRole("option", { name: "Paid only" }).click();
  await expect(page).toHaveURL(/isFree=false/);
  await expect(rows).toHaveCount(2);
  await expect(row("small-free")).toHaveCount(0);

  await page.getByRole("button", { name: "More filters" }).click();
  await page.getByLabel("Min. members").fill("100");
  await page.getByLabel("Max. members").fill("1000");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/minMembers=100/);
  await expect(page).toHaveURL(/maxMembers=1000/);
  await expect(rows).toHaveCount(1);
  await expect(row("mid-paid")).toHaveCount(1);
  await expect(page.getByText("Members: 100–1,000")).toBeVisible();

  await page
    .getByRole("button", { name: "Remove filter: Members: 100–1,000" })
    .click();
  await expect(page).not.toHaveURL(/minMembers/);
  await expect(rows).toHaveCount(2);

  await page.getByRole("combobox", { name: "Sort by" }).click();
  await page.getByRole("option", { name: "Most members" }).click();
  await expect(page).toHaveURL(/sort=members/);
  await expect(rows.first()).toContainText(`big-paid ${id}`);

  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(page).not.toHaveURL(/isFree/);
  await expect(page).not.toHaveURL(/search=/);
});

test("opens a community sheet from its row and jumps to the owner and back", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const lead = await seed.createLead({
    name: `Owner ${id}`,
    username: `owner-${id}`,
  });
  await seed.createCommunity({
    leadId: lead.leadId,
    name: `Detail ${id}`,
    slug: `detail-${id}`,
    members: 321,
    priceCents: 2700,
  });

  await page.goto(`/admin/communities?search=${id}`);
  // The whole row opens the sheet, not only the name
  await page.locator("tbody tr").first().getByText("$27 per month").click();

  const sheet = page.getByRole("dialog");
  await expect(
    sheet.getByRole("heading", { name: `Detail ${id}` }),
  ).toBeVisible();
  await expect(sheet.getByText("$27 per month")).toBeVisible();
  await expect(sheet.getByText("321")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/communities(\?|$)/);

  await sheet.getByRole("button", { name: `Owner ${id}` }).click();
  await expect(
    sheet.getByRole("heading", { name: `Owner ${id}` }),
  ).toBeVisible();
  await sheet.getByRole("button", { name: `Detail ${id}` }).click();
  await expect(
    sheet.getByRole("heading", { name: `Detail ${id}` }),
  ).toBeVisible();
});

test("edits a community, moves it to free and keeps the rest", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const lead = await seed.createLead({
    name: `Owner ${id}`,
    username: `owner-${id}`,
  });
  const community = await seed.createCommunity({
    leadId: lead.leadId,
    name: `Before ${id}`,
    slug: `edit-${id}`,
    members: 50,
    email: `keep-${id}@example.com`,
    priceCents: 2700,
  });

  await page.goto(`/admin/communities/${community.communityId}/edit`);
  await expect(field(page, "Name")).toHaveValue(`Before ${id}`);
  await expect(field(page, "Price")).toHaveValue("27");
  await field(page, "Name").fill(`After ${id}`);
  await page.getByRole("button", { name: "Free" }).click();
  await page.getByRole("button", { name: "Save community" }).click();

  await expect(page).toHaveURL(/\/admin\/communities(\?|$)/);
  expect(await seed.findCommunityBySlug(`edit-${id}`)).toMatchObject({
    name: `After ${id}`,
    isFree: true,
    priceCents: null,
    priceCurrency: null,
    priceInterval: null,
    members: 50,
    email: `keep-${id}@example.com`,
    leadId: lead.leadId,
  });
});

test("deletes a community from its sheet and leaves the owner", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const lead = await seed.createLead({
    name: `Owner ${id}`,
    username: `owner-${id}`,
  });
  await seed.createCommunity({
    leadId: lead.leadId,
    name: `Doomed ${id}`,
    slug: `doomed-${id}`,
  });

  await page.goto(`/admin/communities?search=${id}`);
  await page.getByRole("button", { name: `Doomed ${id}`, exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete" })
    .click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await seed.findCommunityBySlug(`doomed-${id}`)).toBeNull();
  expect(await seed.findLeadByUsername(`owner-${id}`)).not.toBeNull();
});

test("deletes a community from its row menu", async ({ page, seed }) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const lead = await seed.createLead({
    name: `Owner ${id}`,
    username: `owner-${id}`,
  });
  for (const slug of ["gone", "stays"]) {
    await seed.createCommunity({
      leadId: lead.leadId,
      name: `${slug} ${id}`,
      slug: `${slug}-${id}`,
    });
  }

  await page.goto(`/admin/communities?search=${id}`);
  await rowActions(page, `gone ${id}`).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete" })
    .click();

  await expect(
    page.getByRole("button", { name: `gone ${id}`, exact: true }),
  ).toHaveCount(0);
  expect(await seed.findCommunityBySlug(`gone-${id}`)).toBeNull();
  expect(await seed.findCommunityBySlug(`stays-${id}`)).not.toBeNull();
});

test("bulk deletes the selected communities only after confirmation", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const lead = await seed.createLead({
    name: `Owner ${id}`,
    username: `owner-${id}`,
  });
  for (const number of ["1", "2", "3"]) {
    await seed.createCommunity({
      leadId: lead.leadId,
      name: `bulk ${number} ${id}`,
      slug: `bulk-${number}-${id}`,
    });
  }

  await page.goto(`/admin/communities?search=${id}`);
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await page.getByRole("checkbox", { name: `Select bulk 1 ${id}` }).check();
  await page.getByRole("checkbox", { name: `Select bulk 2 ${id}` }).check();
  await expect(page.getByText("2 selected")).toBeVisible();

  await page.getByRole("button", { name: "Delete 2 communities" }).click();
  const dialog = page.getByRole("alertdialog", {
    name: "Delete 2 communities?",
  });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  for (const number of ["1", "2", "3"]) {
    expect(
      await seed.findCommunityBySlug(`bulk-${number}-${id}`),
    ).not.toBeNull();
  }

  await page.getByRole("button", { name: "Delete 2 communities" }).click();
  await page
    .getByRole("alertdialog", { name: "Delete 2 communities?" })
    .getByRole("button", { name: "Delete" })
    .click();

  await expect(page.locator("tbody tr")).toHaveCount(1);
  expect(await seed.findCommunityBySlug(`bulk-1-${id}`)).toBeNull();
  expect(await seed.findCommunityBySlug(`bulk-2-${id}`)).toBeNull();
  expect(await seed.findCommunityBySlug(`bulk-3-${id}`)).not.toBeNull();
  expect(await seed.findLeadByUsername(`owner-${id}`)).not.toBeNull();
});

test("adding a community from a lead sheet pre-selects that lead as owner", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const lead = await seed.createLead({
    name: `Owner ${id}`,
    username: `owner-${id}`,
  });

  await page.goto(`/admin/leads?search=${id}`);
  await page.getByRole("button", { name: `Owner ${id}`, exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "Add community" })
    .click();

  await expect(page).toHaveURL(new RegExp(`leadId=${lead.leadId}`));
  await expect(page.getByRole("combobox", { name: "Owner" })).toHaveValue(
    `Owner ${id}`,
  );
});

test("a non-admin cannot bulk delete communities", async ({ page, seed }) => {
  const member = await seed.createVerifiedMember();
  await seed.authenticate(page.context(), member.email);
  const id = token();
  const lead = await seed.createLead({
    name: `Owner ${id}`,
    username: `owner-${id}`,
  });
  const community = await seed.createCommunity({
    leadId: lead.leadId,
    name: `Protected ${id}`,
    slug: `protected-${id}`,
  });

  const response = await page.request.post(
    `${API_URL}/api/communities/bulk-delete`,
    { data: { communityIds: [community.communityId] } },
  );

  expect(response.status()).toBe(403);
  expect(await seed.findCommunityBySlug(`protected-${id}`)).not.toBeNull();
});

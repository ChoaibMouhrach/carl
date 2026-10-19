import { test, expect } from "../fixtures";
import type { Page } from "@playwright/test";
import { rowActions, confirmDelete, token } from "./support";

type Seed = Parameters<Parameters<typeof test>[2]>[0]["seed"];

const seedLeads = async (seed: Seed, id: string, count: number) => {
  const leads = [];
  for (let index = 1; index <= count; index += 1) {
    leads.push(
      await seed.createLead({
        skoolUsername: `e2e-${id}-${String(index).padStart(2, "0")}`,
        name: `Lead ${id} ${String(index).padStart(2, "0")}`,
      }),
    );
  }
  return leads;
};

// The list sits inside a page Card, so the item cards are the Cards nested within it
const cardsOf = (page: Page, id: string) =>
  page
    .locator('[data-slot="card"] [data-slot="card"]')
    .filter({ hasText: `Lead ${id}` });

const cardView = (page: Page) =>
  page.getByRole("button", { name: "Card view" });
const tableView = (page: Page) =>
  page.getByRole("button", { name: "Table view" });

test("the view switch changes a list between a table and cards and the choice is remembered everywhere", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const [lead] = await seedLeads(seed, id, 2);
  await seed.createCommunity({
    leadId: lead!.leadId,
    skoolId: `skool-${id}`,
    name: `club-${id}`,
    displayName: `Club ${id}`,
    memberCount: 5,
  });
  const campaign = await seed.createCampaign({ name: `Campaign ${id}` });
  await seed.attachCampaignLeads({
    campaignId: campaign.campaignId,
    leads: [{ leadId: lead!.leadId, stage: 1, status: "done" }],
  });

  await page.goto(`/admin/leads?search=${id}`);
  await expect(page.getByRole("table")).toBeVisible();
  await expect(tableView(page)).toHaveAttribute("aria-pressed", "true");

  await cardView(page).click();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(cardsOf(page, id)).toHaveCount(2);
  await expect(cardView(page)).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(cardsOf(page, id)).toHaveCount(2);

  for (const path of [
    `/admin/communities?search=${id}`,
    `/admin/campaigns?search=${id}`,
    `/admin/campaigns/${campaign.campaignId}`,
  ]) {
    await page.goto(path);
    await expect(cardView(page)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("table")).toHaveCount(0);
  }

  await tableView(page).click();
  await expect(page.getByRole("table")).toBeVisible();
  await page.goto(`/admin/leads?search=${id}`);
  await expect(page.getByRole("table")).toBeVisible();
});

test("a lead's communities list follows the saved view without offering the switch", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const [lead] = await seedLeads(seed, id, 1);
  await seed.createCommunity({
    leadId: lead!.leadId,
    skoolId: `skool-${id}`,
    name: `club-${id}`,
    displayName: `Club ${id}`,
    memberCount: 5,
  });

  await page.goto(`/admin/leads/${lead!.leadId}`);
  await expect(page.getByRole("table")).toBeVisible();
  await expect(cardView(page)).toHaveCount(0);

  await page.goto(`/admin/leads?search=${id}`);
  await cardView(page).click();
  await page.goto(`/admin/leads/${lead!.leadId}`);
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(
    page
      .locator('[data-slot="card"] [data-slot="card"]')
      .filter({ hasText: `Club ${id}` }),
  ).toHaveCount(1);
});

test("on a phone the lists are always cards and the switch is hidden", async ({
  browser,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  const context = await browser.newContext({
    viewport: { width: 375, height: 800 },
  });
  await seed.authenticate(context, admin.email);
  const page = await context.newPage();
  const id = token();
  await seedLeads(seed, id, 2);
  // Even a saved preference for the table cannot bring the table back on a phone
  await page.addInitScript(() => localStorage.setItem("list-view", "table"));

  await page.goto(`/admin/leads?search=${id}`);

  await expect(cardsOf(page, id)).toHaveCount(2);
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(cardView(page)).toHaveCount(0);
  await expect(tableView(page)).toHaveCount(0);
  await context.close();
});

test("selecting rows in the table: select all, a partial state, the count and clearing", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  await seedLeads(seed, id, 3);
  const all = () => page.getByRole("checkbox", { name: "Select all" });
  const row = (n: string) =>
    page.getByRole("row").filter({ hasText: `Lead ${id} ${n}` });

  await page.goto(`/admin/leads?search=${id}&sortBy=name&sortOrder=asc`);
  await expect(page.getByText("selected")).toHaveCount(0);

  await row("01").getByRole("checkbox").click();
  await expect(page.getByText("1 selected")).toBeVisible();
  await expect(all()).toHaveAttribute("aria-checked", "mixed");
  await expect(row("01").getByRole("checkbox")).toBeChecked();
  await expect(row("02").getByRole("checkbox")).not.toBeChecked();

  await all().click();
  await expect(page.getByText("3 selected")).toBeVisible();
  await expect(all()).toBeChecked();

  await all().click();
  await expect(page.getByText("selected")).toHaveCount(0);

  await row("02").getByRole("checkbox").click();
  await row("03").getByRole("checkbox").click();
  await expect(page.getByText("2 selected")).toBeVisible();
  await page.getByRole("button", { name: "Clear selection" }).click();
  await expect(page.getByText("selected")).toHaveCount(0);
  await expect(row("02").getByRole("checkbox")).not.toBeChecked();
});

test("selecting cards: every card has a checkbox, select all lives in the bar and a selected card is outlined", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  await seedLeads(seed, id, 3);

  await page.goto(`/admin/leads?search=${id}&sortBy=name&sortOrder=asc`);
  await cardView(page).click();
  await expect(cardsOf(page, id)).toHaveCount(3);
  await expect(page.getByRole("checkbox", { name: "Select item" })).toHaveCount(
    3,
  );

  const first = cardsOf(page, id).first();
  await first.getByRole("checkbox").click();
  await expect(page.getByText("1 selected")).toBeVisible();
  await expect(first.locator("xpath=..")).toHaveClass(
    /(^|\s)ring-primary(\s|$)/,
  );
  await expect(cardsOf(page, id).nth(1).locator("xpath=..")).not.toHaveClass(
    /(^|\s)ring-2(\s|$)/,
  );
  await expect(
    page.getByRole("checkbox", { name: "Select all" }),
  ).toHaveAttribute("aria-checked", "mixed");

  await page.getByRole("checkbox", { name: "Select all" }).click();
  await expect(page.getByText("3 selected")).toBeVisible();

  await page.getByRole("button", { name: "Clear selection" }).click();
  await expect(page.getByText("selected")).toHaveCount(0);
  // Ticking a card's checkbox must not open the lead
  await expect(page).toHaveURL(/\/admin\/leads\?/);
});

test("a selection is dropped when the page, search or rows change", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  await seedLeads(seed, id, 13);

  await page.goto(`/admin/leads?search=${id}&sortBy=name&sortOrder=asc`);
  await page.getByRole("checkbox", { name: "Select all" }).click();
  await expect(page.getByText("12 selected")).toBeVisible();

  await page
    .getByRole("navigation", { name: "pagination" })
    .getByLabel("Go to next page")
    .click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByText("selected")).toHaveCount(0);

  await page.goto(`/admin/leads?search=${id}&sortBy=name&sortOrder=asc`);
  await page.getByRole("checkbox", { name: "Select all" }).click();
  await page.getByPlaceholder("Search by name or username").fill(`${id} 01`);
  await expect(page.getByText("selected")).toHaveCount(0);

  await page.goto(`/admin/leads?search=${id}&sortBy=name&sortOrder=asc`);
  await page
    .getByRole("row")
    .filter({ hasText: `Lead ${id} 02` })
    .getByRole("checkbox")
    .click();
  await expect(page.getByText("1 selected")).toBeVisible();
  await rowActions(page, `Lead ${id} 03`).click();
  await confirmDelete(page);
  await expect(
    page.getByRole("row").filter({ hasText: `Lead ${id} 03` }),
  ).toHaveCount(0);
  await expect(page.getByText("selected")).toHaveCount(0);
});

test("selection works on the other lists too", async ({ page, seed }) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const [lead] = await seedLeads(seed, id, 1);
  await seed.createCommunity({
    leadId: lead!.leadId,
    skoolId: `skool-${id}-1`,
    name: `club-${id}-1`,
    displayName: `Club ${id} 1`,
    memberCount: 1,
  });
  await seed.createCommunity({
    leadId: lead!.leadId,
    skoolId: `skool-${id}-2`,
    name: `club-${id}-2`,
    displayName: `Club ${id} 2`,
    memberCount: 2,
  });
  await seed.createCampaign({ name: `Campaign ${id} 1` });
  await seed.createCampaign({ name: `Campaign ${id} 2` });

  for (const path of [
    `/admin/communities?search=${id}`,
    `/admin/campaigns?search=${id}`,
    `/admin/leads/${lead!.leadId}`,
  ]) {
    await page.goto(path);
    await page.getByRole("checkbox", { name: "Select all" }).first().click();
    const expected = path.includes("/leads/") ? 2 : 2;
    await expect(page.getByText(`${expected} selected`)).toBeVisible();
  }
});

test("Previous and Next do nothing at the ends and an out-of-range page lands on the last page", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  await seedLeads(seed, id, 13);
  const nav = page.getByRole("navigation", { name: "pagination" });
  const previous = nav.getByLabel("Go to previous page");
  const next = nav.getByLabel("Go to next page");

  await page.goto(`/admin/leads?search=${id}&sortBy=name&sortOrder=asc`);
  await expect(previous).toHaveAttribute("aria-disabled", "true");
  await previous.click({ force: true });
  await expect(page).not.toHaveURL(/page=0/);
  await expect(
    page.getByRole("row").filter({ hasText: `Lead ${id}` }),
  ).toHaveCount(12);

  await next.click();
  await expect(page).toHaveURL(/page=2/);
  await expect(next).toHaveAttribute("aria-disabled", "true");
  await next.click({ force: true });
  await expect(page).toHaveURL(/page=2/);
  await expect(
    page.getByRole("row").filter({ hasText: `Lead ${id}` }),
  ).toHaveCount(1);
  expect(
    await next.evaluate((element) => getComputedStyle(element).pointerEvents),
  ).toBe("none");

  await page.goto(
    `/admin/leads?search=${id}&sortBy=name&sortOrder=asc&page=999`,
  );
  await expect(page).toHaveURL(/page=2/);
  await expect(
    page.getByRole("row").filter({ hasText: `Lead ${id}` }),
  ).toHaveCount(1);
});

test("changing page scrolls back to the top", async ({ browser, seed }) => {
  const admin = await seed.createVerifiedAdmin();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 500 },
  });
  await seed.authenticate(context, admin.email);
  const page = await context.newPage();
  const id = token();
  await seedLeads(seed, id, 13);

  await page.goto(`/admin/leads?search=${id}&sortBy=name&sortOrder=asc`);
  const next = page
    .getByRole("navigation", { name: "pagination" })
    .getByLabel("Go to next page");
  await next.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);

  await next.click();
  await expect(page).toHaveURL(/page=2/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await context.close();
});

test("no domain page overflows horizontally on a phone", async ({
  browser,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  const context = await browser.newContext({
    viewport: { width: 375, height: 800 },
  });
  await seed.authenticate(context, admin.email);
  const page = await context.newPage();
  const id = token();
  const [lead] = await seedLeads(seed, id, 1);
  const community = await seed.createCommunity({
    leadId: lead!.leadId,
    skoolId: `skool-${id}`,
    name: `club-${id}`,
    displayName: `A community with a very long display name ${id} that keeps going`,
    memberCount: 5,
  });
  const campaign = await seed.createCampaign({
    name: `A campaign with a very long name ${id} that keeps going and going`,
    description: "A long description ".repeat(10),
  });
  await seed.attachCampaignLeads({
    campaignId: campaign.campaignId,
    leads: [{ leadId: lead!.leadId, stage: 1, status: "done" }],
  });

  const paths = [
    "/admin/leads",
    `/admin/leads/${lead!.leadId}`,
    "/admin/leads/new",
    `/admin/leads/${lead!.leadId}/edit`,
    "/admin/communities",
    "/admin/communities/new",
    `/admin/communities/${community.communityId}/edit`,
    "/admin/campaigns",
    "/admin/campaigns/new",
    `/admin/campaigns/${campaign.campaignId}`,
    `/admin/campaigns/${campaign.campaignId}/edit`,
    "/admin/queues",
  ];

  for (const path of paths) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect([path, overflow]).toEqual([path, 0]);
  }
  await context.close();
});

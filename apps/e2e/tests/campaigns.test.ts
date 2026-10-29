import type { Page } from "@playwright/test";
import { test as base, expect } from "../fixtures";
import { API_URL } from "../config";
import {
  confirmDelete,
  expectOptional,
  expectRequired,
  field,
  rowActions,
  token,
} from "./support";

// Each test names its campaigns after a token and removes them afterwards, so the
// pickers (which list the first 100 campaigns by name) never fill up with leftovers
const test = base.extend<{ id: string }>({
  id: async ({ seed }, use) => {
    const id = token();
    await use(id);
    await seed.deleteCampaignsContaining(id);
  },
});

const campaignName = (id: string, suffix = "") => `0-${id}${suffix}`;

const addToCampaign = async (page: Page, name: string) => {
  await page.getByRole("button", { name: "Add to campaign" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Add to campaign" }),
  ).toBeDisabled();
  await dialog.getByRole("combobox", { name: "Campaign" }).click();
  await page.getByRole("option", { name, exact: true }).click();
  await dialog.getByRole("button", { name: "Add to campaign" }).click();
  await expect(dialog).toHaveCount(0);
};

test("creates a campaign from the form and stores every field", async ({
  page,
  seed,
  id,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const name = campaignName(id);

  await page.goto("/admin/campaigns/new");

  await expectRequired(page, "Name", "Fitness coaches");
  await expectRequired(page, "Search keyword", "fitness coaching");
  await expectOptional(page, "Description");
  await expectOptional(page, "Minimum price");
  await expectOptional(page, "Minimum members");

  await field(page, "Name").fill(name);
  await page.getByLabel("Description").fill("Paid fitness communities");
  await field(page, "Search keyword").fill("fitness coaching");
  await page.getByLabel("Minimum price").fill("49.99");
  await page.getByLabel("Minimum members").fill("100");
  await page.getByRole("button", { name: "Create campaign" }).click();

  await expect(page).toHaveURL(/\/admin\/campaigns(\?.*)?$/);
  expect(await seed.findCampaignByName(name)).toMatchObject({
    name,
    description: "Paid fitness communities",
    keyword: "fitness coaching",
    minPriceCents: 4999,
    minMembers: 100,
  });

  await page.goto(`/admin/campaigns?search=${id}`);
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toContainText("$49.99 / mo");
  await expect(row).toContainText("100");
});

test("a campaign with only a name and keyword stores the rest as empty", async ({
  page,
  seed,
  id,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const name = campaignName(id);

  await page.goto("/admin/campaigns/new");
  await field(page, "Name").fill(name);
  await field(page, "Search keyword").fill("yoga");
  await page.getByRole("button", { name: "Create campaign" }).click();

  await expect(page).toHaveURL(/\/admin\/campaigns(\?.*)?$/);
  expect(await seed.findCampaignByName(name)).toMatchObject({
    name,
    keyword: "yoga",
    description: null,
    minPriceCents: null,
    minMembers: null,
  });

  await page.goto(`/admin/campaigns?search=${id}`);
  await expect(page.getByRole("row").filter({ hasText: name })).toContainText(
    "No description",
  );
});

test("refuses invalid input and creates no campaign", async ({
  page,
  seed,
  id,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);

  await page.goto("/admin/campaigns/new");
  await page.getByRole("button", { name: "Create campaign" }).click();

  await expect(page).toHaveURL(/\/admin\/campaigns\/new$/);
  await expect(field(page, "Name")).toHaveAttribute("aria-invalid", "true");
  await expect(field(page, "Search keyword")).toHaveAttribute(
    "aria-invalid",
    "true",
  );

  await field(page, "Name").fill(campaignName(id));
  await field(page, "Search keyword").fill("yoga");
  await page.getByLabel("Minimum price").fill("cheap");
  await page.getByLabel("Minimum members").fill("1.5");
  await page.getByRole("button", { name: "Create campaign" }).click();

  await expect(page).toHaveURL(/\/admin\/campaigns\/new$/);
  await expect(page.getByLabel("Minimum price")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByLabel("Minimum members")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(await seed.countCampaignsContaining(id)).toBe(0);
});

test("editing fills the form, saves only real changes and can clear a minimum", async ({
  page,
  seed,
  id,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const campaign = await seed.createCampaign({
    name: campaignName(id),
    keyword: "fitness",
    description: "Keep this description",
    minPriceCents: 4900,
    minMembers: 250,
  });

  await page.goto(`/admin/campaigns/${campaign.campaignId}/edit`);

  await expect(field(page, "Name")).toHaveValue(campaignName(id));
  await expect(page.getByLabel("Minimum price")).toHaveValue("49");
  await expect(page.getByLabel("Minimum members")).toHaveValue("250");
  // Nothing has changed yet, so there is nothing to save
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeDisabled();

  await field(page, "Search keyword").fill("yoga");
  await page.getByLabel("Minimum price").fill("");
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page).toHaveURL(/\/admin\/campaigns(\?.*)?$/);
  expect(await seed.findCampaignByName(campaignName(id))).toMatchObject({
    campaignId: campaign.campaignId,
    keyword: "yoga",
    minPriceCents: null,
    description: "Keep this description",
    minMembers: 250,
  });
});

test("shows a skeleton while the campaigns load", async ({
  page,
  seed,
  id,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  await seed.createCampaign({ name: campaignName(id), keyword: "slow" });

  await page.route(
    (url) => url.pathname === "/api/campaigns",
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.continue();
    },
  );
  await page.goto(`/admin/campaigns?search=${id}`);

  await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: campaignName(id) }),
  ).toBeVisible();
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
});

test("shows a skeleton while a campaign loads", async ({ page, seed, id }) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const campaign = await seed.createCampaign({
    name: campaignName(id),
    keyword: "slow",
  });

  await page.route(
    (url) => url.pathname === `/api/campaigns/${campaign.campaignId}`,
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.continue();
    },
  );
  await page.goto(`/admin/campaigns/${campaign.campaignId}`);

  await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: campaignName(id) }),
  ).toBeVisible();
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
});

test("deleting a campaign from its row keeps its leads and communities", async ({
  page,
  seed,
  id,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const lead = await seed.createLead({
    name: `Member ${id}`,
    username: `member-${id}`,
  });
  const community = await seed.createCommunity({
    leadId: lead.leadId,
    name: `Member community ${id}`,
    slug: `member-community-${id}`,
  });
  const campaign = await seed.createCampaign({
    name: campaignName(id),
    keyword: "doomed",
  });
  await seed.addLeadsToCampaign({
    campaignId: campaign.campaignId,
    leadIds: [lead.leadId],
  });
  await seed.addCommunitiesToCampaign({
    campaignId: campaign.campaignId,
    communityIds: [community.communityId],
  });

  await page.goto(`/admin/campaigns?search=${id}`);
  await rowActions(page, campaignName(id)).click();
  await confirmDelete(page);

  await expect(page.getByRole("link", { name: campaignName(id) })).toHaveCount(
    0,
  );
  expect(await seed.findCampaignByName(campaignName(id))).toBeNull();
  expect(await seed.listCampaignLeadIds(campaign.campaignId)).toEqual([]);
  expect(await seed.listCampaignCommunityIds(campaign.campaignId)).toEqual([]);
  expect(await seed.findLeadByUsername(`member-${id}`)).not.toBeNull();
  expect(
    await seed.findCommunityBySlug(`member-community-${id}`),
  ).not.toBeNull();
});

test("adds the selected leads to a campaign once, however often it is repeated", async ({
  page,
  seed,
  id,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const prefix = `add-${id}`;
  await seed.createLeads({ prefix, count: 3 });
  const [first, second, third] = await Promise.all(
    ["01", "02", "03"].map((number) =>
      seed.findLeadByUsername(`${prefix}-${number}`),
    ),
  );
  if (!first || !second || !third)
    throw new Error("the seeded leads are missing");
  const campaign = await seed.createCampaign({
    name: campaignName(id),
    keyword: "adding",
  });

  await page.goto(`/admin/leads?search=${id}`);
  await page.getByRole("checkbox", { name: `Select ${prefix} 01` }).check();
  await page.getByRole("checkbox", { name: `Select ${prefix} 02` }).check();
  await expect(
    page.getByRole("button", { name: "Add to campaign" }),
  ).toBeVisible();
  await addToCampaign(page, campaignName(id));

  await expect
    .poll(() => seed.listCampaignLeadIds(campaign.campaignId))
    .toEqual([first.leadId, second.leadId]);
  await expect(page.getByText("2 selected")).toHaveCount(0);

  await page.getByRole("checkbox", { name: `Select ${prefix} 01` }).check();
  await page.getByRole("checkbox", { name: `Select ${prefix} 03` }).check();
  await addToCampaign(page, campaignName(id));

  await expect
    .poll(() => seed.listCampaignLeadIds(campaign.campaignId))
    .toEqual([first.leadId, second.leadId, third.leadId]);
});

test("adds the selected communities to a campaign", async ({
  page,
  seed,
  id,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const lead = await seed.createLead({
    name: `Owner ${id}`,
    username: `owner-${id}`,
  });
  const chosen = await seed.createCommunity({
    leadId: lead.leadId,
    name: `Chosen ${id}`,
    slug: `chosen-${id}`,
  });
  await seed.createCommunity({
    leadId: lead.leadId,
    name: `Skipped ${id}`,
    slug: `skipped-${id}`,
  });
  const campaign = await seed.createCampaign({
    name: campaignName(id),
    keyword: "communities",
  });

  await page.goto(`/admin/communities?search=${id}`);
  await page.getByRole("checkbox", { name: `Select Chosen ${id}` }).check();
  await addToCampaign(page, campaignName(id));

  await expect
    .poll(() => seed.listCampaignCommunityIds(campaign.campaignId))
    .toEqual([chosen.communityId]);
});

test("filters leads and communities by campaign and the chip clears it", async ({
  page,
  seed,
  id,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const inside = await seed.createLead({
    name: `Inside ${id}`,
    username: `inside-${id}`,
  });
  const outside = await seed.createLead({
    name: `Outside ${id}`,
    username: `outside-${id}`,
  });
  const insideCommunity = await seed.createCommunity({
    leadId: inside.leadId,
    name: `Inside community ${id}`,
    slug: `inside-community-${id}`,
  });
  await seed.createCommunity({
    leadId: outside.leadId,
    name: `Outside community ${id}`,
    slug: `outside-community-${id}`,
  });
  const campaign = await seed.createCampaign({
    name: campaignName(id),
    keyword: "filtering",
  });
  await seed.addLeadsToCampaign({
    campaignId: campaign.campaignId,
    leadIds: [inside.leadId],
  });
  await seed.addCommunitiesToCampaign({
    campaignId: campaign.campaignId,
    communityIds: [insideCommunity.communityId],
  });

  await page.goto(
    `/admin/leads?search=${id}&campaignId=${campaign.campaignId}`,
  );
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: `Inside ${id}`, exact: true }),
  ).toBeVisible();
  await expect(page.getByText(`Campaign: ${campaignName(id)}`)).toBeVisible();

  await page
    .getByRole("button", {
      name: `Remove filter: Campaign: ${campaignName(id)}`,
    })
    .click();
  await expect(page).not.toHaveURL(/campaignId=/);
  await expect(page.locator("tbody tr")).toHaveCount(2);

  await page.goto(
    `/admin/communities?search=${id}&campaignId=${campaign.campaignId}`,
  );
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: `Inside community ${id}`, exact: true }),
  ).toBeVisible();
});

test("the campaign page walks through the pipeline steps and remembers the one you were on", async ({
  page,
  seed,
  id,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const campaign = await seed.createCampaign({
    name: campaignName(id),
    keyword: "pipeline",
  });

  await page.goto(`/admin/campaigns/${campaign.campaignId}`);
  await expect(
    page.getByRole("heading", { name: campaignName(id) }),
  ).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Run scrape" })).toBeVisible();

  await page.getByRole("button", { name: /Tavily/ }).click();
  await expect(page.getByText("Waiting for the scrape")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Waiting for the scrape")).toBeVisible();

  await page
    .getByRole("button", { name: /Scrape/ })
    .first()
    .click();
  await expect(page.getByRole("button", { name: "Run scrape" })).toBeVisible();

  await page.getByRole("button", { name: /FullEnrich/ }).click();
  await expect(page).toHaveURL(/step=fullenrich/);
  await expect(page.getByText("Waiting for Tavily")).toBeVisible();
  await page
    .getByRole("button", { name: /Scrape/ })
    .first()
    .click();
  await expect(page.getByRole("button", { name: "Run scrape" })).toBeVisible();
});

test("a non-admin cannot create a campaign or change its members", async ({
  page,
  seed,
  id,
}) => {
  const member = await seed.createVerifiedMember();
  await seed.authenticate(page.context(), member.email);
  const lead = await seed.createLead({
    name: `Guarded ${id}`,
    username: `guarded-${id}`,
  });
  const campaign = await seed.createCampaign({
    name: campaignName(id),
    keyword: "guarded",
  });

  const created = await page.request.post(`${API_URL}/api/campaigns`, {
    data: { name: campaignName(id, "-new"), keyword: "sneaky" },
  });
  const added = await page.request.post(
    `${API_URL}/api/campaigns/${campaign.campaignId}/leads`,
    { data: { leadIds: [lead.leadId] } },
  );

  expect(created.status()).toBe(403);
  expect(added.status()).toBe(403);
  expect(await seed.findCampaignByName(campaignName(id, "-new"))).toBeNull();
  expect(await seed.listCampaignLeadIds(campaign.campaignId)).toEqual([]);
});

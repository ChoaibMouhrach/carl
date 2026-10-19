import { test, expect } from "../fixtures";
import type { Page } from "@playwright/test";
import { confirmDelete, expectRequired, rowActions, token } from "./support";

const chips = (page: Page) => page.locator('[data-slot="combobox-chip"]');

const chooseType = async (page: Page, option: string) => {
  await page.getByRole("combobox").filter({ hasText: "Select a type" }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
};

const choosePricing = async (page: Page, option: string) => {
  await page
    .getByRole("combobox")
    .filter({ hasText: "Select a pricing model" })
    .click();
  await page.getByRole("option", { name: option, exact: true }).click();
};

const addKeyword = async (page: Page, keyword: string, key = "Enter") => {
  const input = page.getByLabel(/^Search keywords/);
  await input.click();
  await input.pressSequentially(keyword);
  await input.press(key);
};

test("an admin creates a campaign with keywords, search settings and limits", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();

  await page.goto("/admin/campaigns");
  await page.getByRole("link", { name: "New campaign" }).click();
  await expect(page).toHaveURL(/\/admin\/campaigns\/new/);

  await page.getByLabel(/^Name\s*\*?$/).fill(`Campaign ${id}`);
  await page.getByLabel(/^Description/).fill("Gym owners in Europe");
  await addKeyword(page, `alpha ${id}`);
  await addKeyword(page, `beta ${id}`, ",");
  await page.getByLabel(/^Search keywords/).pressSequentially(`gamma ${id}`);
  await page.getByLabel(/^Name\s*\*?$/).click();
  await expect(chips(page)).toHaveText([
    `alpha ${id}`,
    `beta ${id}`,
    `gamma ${id}`,
  ]);

  await chooseType(page, "Private");
  await choosePricing(page, "Free trial");
  await page.getByLabel(/^Min price per month/).fill("9.5");
  await page.getByLabel(/^Max price per month/).fill("199");
  await page.getByLabel(/^Min members/).fill("50");
  await page.getByLabel(/^Max members/).fill("5000");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page).toHaveURL(/\/admin\/campaigns\/\d+/);
  await expect
    .poll(() => seed.findCampaignByName(`Campaign ${id}`))
    .toMatchObject({
      description: "Gym owners in Europe",
      status: "draft",
      keywords: [`alpha ${id}`, `beta ${id}`, `gamma ${id}`],
      types: ["private"],
      pricingModels: ["free-trial"],
      minMonthlyPriceUsd: 9.5,
      maxMonthlyPriceUsd: 199,
      minMembers: 50,
      maxMembers: 5000,
    });

  await page.goto(`/admin/campaigns?search=${id}`);
  await expect(
    page.getByRole("row").filter({ hasText: `Campaign ${id}` }),
  ).toHaveCount(1);
});

test("the campaign form marks its required fields and shows placeholders", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);

  await page.goto("/admin/campaigns/new");

  await expectRequired(page, "Name", "Fitness coaches, Q4");
  await expectRequired(
    page,
    "Search keywords",
    "Type a keyword and press Enter",
  );
  await expectRequired(page, "Type", "Select a type");
  await expectRequired(page, "Pricing model", "Select a pricing model");
  await expect(page.getByLabel(/^Description/)).toHaveAttribute(
    "placeholder",
    /.+/,
  );
  await expect(page.getByLabel(/^Min price per month/)).toHaveAttribute(
    "placeholder",
    "No minimum",
  );
  await expect(page.getByLabel(/^Max price per month/)).toHaveAttribute(
    "placeholder",
    "No maximum",
  );
  await expect(page.getByLabel(/^Min members/)).toHaveAttribute(
    "placeholder",
    "No minimum",
  );
  await expect(page.getByLabel(/^Max members/)).toHaveAttribute(
    "placeholder",
    "No maximum",
  );
});

test("the type and pricing model start empty and nothing is stored until everything required is set", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const save = () => page.getByRole("button", { name: "Save" }).click();

  await page.goto("/admin/campaigns/new");
  await expect(
    page.getByRole("combobox").filter({ hasText: "Select a type" }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox").filter({ hasText: "Select a pricing model" }),
  ).toBeVisible();

  await page.getByLabel(/^Name\s*\*?$/).fill(`Campaign ${id}`);
  await save();
  await expect(page).toHaveURL(/\/admin\/campaigns\/new/);

  await addKeyword(page, `alpha ${id}`);
  await save();
  await expect(page).toHaveURL(/\/admin\/campaigns\/new/);

  await chooseType(page, "Public");
  await save();
  await expect(page).toHaveURL(/\/admin\/campaigns\/new/);

  // Without a name the form must also refuse, even with everything else filled in
  await choosePricing(page, "Paid");
  await page.getByLabel(/^Name\s*\*?$/).fill("");
  await save();
  await expect(page).toHaveURL(/\/admin\/campaigns\/new/);

  // Every attempt was stopped by the form's own checks, so nothing may exist for this token
  expect(await seed.findCampaignByName(`Campaign ${id}`)).toBeNull();
});

test("a minimum above a maximum is refused with a message on the maximum", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();

  await page.goto("/admin/campaigns/new");
  await page.getByLabel(/^Name\s*\*?$/).fill(`Campaign ${id}`);
  await addKeyword(page, `alpha ${id}`);
  await chooseType(page, "Public");
  await choosePricing(page, "Paid");

  await page.getByLabel(/^Min price per month/).fill("50");
  await page.getByLabel(/^Max price per month/).fill("10");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/admin\/campaigns\/new/);
  await expect(
    page.getByText("Minimum cannot be greater than maximum."),
  ).toBeVisible();

  await page.getByLabel(/^Max price per month/).fill("60");
  await page.getByLabel(/^Min members/).fill("100");
  await page.getByLabel(/^Max members/).fill("10");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/admin\/campaigns\/new/);

  await page.getByLabel(/^Min members/).fill("-5");
  await page.getByLabel(/^Max members/).fill("");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/admin\/campaigns\/new/);

  await page.getByLabel(/^Min members/).fill("12.5");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/admin\/campaigns\/new/);

  expect(await seed.findCampaignByName(`Campaign ${id}`)).toBeNull();
});

test("keywords are added with Enter, a comma or leaving the field, and never twice", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const input = page.getByLabel(/^Search keywords/);

  await page.goto("/admin/campaigns/new");
  await addKeyword(page, "alpha");
  await addKeyword(page, "beta", ",");
  await addKeyword(page, "ALPHA");
  await addKeyword(page, "   ");
  await input.pressSequentially("gamma");
  await page.getByLabel(/^Name\s*\*?$/).click();

  await expect(chips(page)).toHaveText(["alpha", "beta", "gamma"]);
  // Typing never opens a dropdown of suggestions
  await input.click();
  await input.pressSequentially("al");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(page.getByRole("option")).toHaveCount(0);
  await input.fill("");

  await page.locator('[data-slot="combobox-chip-remove"]').first().click();
  await expect(chips(page)).toHaveText(["beta", "gamma"]);
  await input.press("Backspace");
  await expect(chips(page)).toHaveText(["beta"]);
  void admin;
  void seed;
});

test("a campaign holds at most ten keywords", async ({ page, seed }) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);

  await page.goto("/admin/campaigns/new");
  for (let index = 1; index <= 11; index += 1) {
    await addKeyword(page, `keyword ${index}`);
  }

  await expect(chips(page)).toHaveCount(10);
  await expect(chips(page).last()).toHaveText("keyword 10");
});

test("editing a campaign loads its saved values and saves the changes", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const campaign = await seed.createCampaign({
    name: `Before ${id}`,
    description: "Keep me",
    keywords: [`one ${id}`, `two ${id}`],
    types: ["public"],
    pricingModels: ["paid"],
    minMonthlyPriceUsd: 10,
    maxMonthlyPriceUsd: 100,
    minMembers: 5,
  });

  await page.goto(`/admin/campaigns/${campaign.campaignId}/edit`);
  await expect(page.getByLabel(/^Name\s*\*?$/)).toHaveValue(`Before ${id}`);
  await expect(chips(page)).toHaveText([`one ${id}`, `two ${id}`]);
  await expect(
    page.getByRole("combobox").filter({ hasText: "Public" }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox").filter({ hasText: "Paid" }),
  ).toBeVisible();
  await expect(page.getByLabel(/^Min price per month/)).toHaveValue("10");
  await expect(page.getByLabel(/^Max price per month/)).toHaveValue("100");

  await page.getByLabel(/^Name\s*\*?$/).fill(`After ${id}`);
  await page.locator('[data-slot="combobox-chip-remove"]').first().click();
  await addKeyword(page, `three ${id}`);
  await page.getByLabel(/^Max price per month/).fill("");
  await page.getByRole("combobox").filter({ hasText: "Public" }).click();
  await page.getByRole("option", { name: "Private", exact: true }).click();
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page).toHaveURL(
    new RegExp(`/admin/campaigns/${campaign.campaignId}(\\?|$)`),
  );
  await expect
    .poll(() => seed.findCampaignByName(`After ${id}`))
    .toMatchObject({
      description: "Keep me",
      keywords: [`two ${id}`, `three ${id}`],
      types: ["private"],
      pricingModels: ["paid"],
      minMonthlyPriceUsd: 10,
      maxMonthlyPriceUsd: null,
      minMembers: 5,
    });
});

test("a campaign moves from draft to active, pauses and resumes, and a completed one has no toggle", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const campaign = await seed.createCampaign({ name: `Status ${id}` });
  const finished = await seed.createCampaign({
    name: `Finished ${id}`,
    status: "completed",
  });

  await page.goto(`/admin/campaigns/${campaign.campaignId}`);
  await page.getByRole("button", { name: "Activate" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect
    .poll(async () => (await seed.findCampaignByName(`Status ${id}`))?.status)
    .toBe("active");

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  await expect
    .poll(async () => (await seed.findCampaignByName(`Status ${id}`))?.status)
    .toBe("paused");

  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect
    .poll(async () => (await seed.findCampaignByName(`Status ${id}`))?.status)
    .toBe("active");

  await page.goto(`/admin/campaigns/${finished.campaignId}`);
  await expect(page.getByRole("link", { name: "Edit" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Activate" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pause" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Resume" })).toHaveCount(0);
});

test("the campaign list searches, filters by status and shows each campaign's pipeline", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const active = await seed.createCampaign({
    name: `Alpha ${id}`,
    description: `Gym owners ${id}`,
    status: "active",
  });
  await seed.createCampaign({ name: `Beta ${id}`, status: "paused" });
  const leads = [];
  for (let index = 1; index <= 3; index += 1) {
    leads.push(
      await seed.createLead({
        skoolUsername: `e2e-${id}-${index}`,
        name: `Lead ${id} ${index}`,
      }),
    );
  }
  await seed.attachCampaignLeads({
    campaignId: active.campaignId,
    leads: [
      { leadId: leads[0]!.leadId, stage: 1, status: "done" },
      { leadId: leads[1]!.leadId, stage: 1, status: "pending" },
      { leadId: leads[2]!.leadId, stage: 2, status: "pending" },
    ],
  });
  const rows = (text: string) =>
    page.getByRole("row").filter({ hasText: text });

  await page.goto(`/admin/campaigns?search=${id}`);
  await expect(rows(`Alpha ${id}`)).toHaveCount(1);
  await expect(rows(`Beta ${id}`)).toHaveCount(1);

  const alpha = rows(`Alpha ${id}`);
  await expect(alpha).toContainText("Active");
  await expect(
    alpha.getByRole("cell", { name: "3", exact: true }),
  ).toBeVisible();
  const pipeline = alpha.getByRole("img", { name: "Leads per stage" });
  await expect(pipeline.locator('[title="Stage 1: 2 leads"]')).toHaveCount(1);
  await expect(pipeline.locator('[title="Stage 2: 1 leads"]')).toHaveCount(1);
  await expect(pipeline.locator('[title="Stage 3: 0 leads"]')).toHaveCount(1);

  await page.getByRole("combobox").filter({ hasText: "All statuses" }).click();
  await page.getByRole("option", { name: "Paused", exact: true }).click();
  await expect(page).toHaveURL(/status=paused/);
  await expect(rows(`Beta ${id}`)).toHaveCount(1);
  await expect(rows(`Alpha ${id}`)).toHaveCount(0);

  await page.goto(`/admin/campaigns?search=gym+owners+${id}`);
  await expect(rows(`Alpha ${id}`)).toHaveCount(1);
  await expect(rows(`Beta ${id}`)).toHaveCount(0);

  await rows(`Alpha ${id}`).getByText(`Alpha ${id}`).click();
  await expect(page).toHaveURL(
    new RegExp(`/admin/campaigns/${active.campaignId}`),
  );
});

test("deleting a campaign removes it and its links but keeps the leads", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const campaign = await seed.createCampaign({ name: `Doomed ${id}` });
  const other = await seed.createCampaign({ name: `Other ${id}` });
  const lead = await seed.createLead({
    skoolUsername: `e2e-${id}`,
    name: `Lead ${id}`,
  });
  for (const target of [campaign, other]) {
    await seed.attachCampaignLeads({
      campaignId: target.campaignId,
      leads: [{ leadId: lead.leadId, stage: 1, status: "done" }],
    });
  }
  await seed.createScrapeRun({
    campaignId: campaign.campaignId,
    status: "completed",
  });

  await page.goto(`/admin/campaigns?search=${id}`);
  await rowActions(page, `Doomed ${id}`).click();
  await confirmDelete(page);

  await expect(
    page.getByRole("row").filter({ hasText: `Doomed ${id}` }),
  ).toHaveCount(0);
  await expect.poll(() => seed.findCampaignByName(`Doomed ${id}`)).toBeNull();
  expect(await seed.listCampaignLeads(campaign.campaignId)).toEqual([]);
  expect(await seed.listScrapeRuns(campaign.campaignId)).toEqual([]);
  expect(await seed.listCampaignLeads(other.campaignId)).toHaveLength(1);
  expect(await seed.findLeadByUsername(`e2e-${id}`)).not.toBeNull();
});

test("the campaign page shows every stage's count and the stage panel's breakdown", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const campaign = await seed.createCampaign({
    name: `Stages ${id}`,
    status: "active",
  });
  const leads = [];
  for (let index = 1; index <= 6; index += 1) {
    leads.push(
      await seed.createLead({
        skoolUsername: `e2e-${id}-${index}`,
        name: `Lead ${id} ${index}`,
      }),
    );
  }
  await seed.attachCampaignLeads({
    campaignId: campaign.campaignId,
    leads: [
      { leadId: leads[0]!.leadId, stage: 1, status: "done" },
      { leadId: leads[1]!.leadId, stage: 1, status: "done" },
      { leadId: leads[2]!.leadId, stage: 1, status: "pending" },
      { leadId: leads[3]!.leadId, stage: 1, status: "failed" },
      { leadId: leads[4]!.leadId, stage: 2, status: "pending" },
      { leadId: leads[5]!.leadId, stage: 2, status: "running" },
    ],
  });

  await page.goto(`/admin/campaigns/${campaign.campaignId}`);
  await expect(page.getByRole("tab", { name: /All stages/ })).toContainText(
    "6",
  );
  await expect(page.getByRole("tab", { name: /Stage 1/ })).toContainText("4");
  await expect(page.getByRole("tab", { name: /Stage 2/ })).toContainText("2");
  await expect(page.getByRole("tab", { name: /Stage 3/ })).toContainText("0");

  // The stage panel only exists once a stage is chosen
  await expect(page.getByRole("button", { name: "Run scrape" })).toHaveCount(0);
  await page.getByRole("tab", { name: /Stage 1/ }).click();
  await expect(page).toHaveURL(/stage=1/);
  const panel = page
    .locator('[data-slot="card"]')
    .filter({ hasText: "Ready to run" });
  const stat = (label: string) =>
    panel
      .getByText(label, { exact: true })
      .locator("xpath=following-sibling::*[1]");
  await expect(stat("Ready to run")).toHaveText("1");
  await expect(stat("Pending")).toHaveText("1");
  await expect(stat("Running")).toHaveText("0");
  await expect(stat("Done")).toHaveText("2");
  await expect(stat("Failed")).toHaveText("1");

  await page.getByRole("tab", { name: /Stage 2/ }).click();
  // Stage 2 is ready for its own pending lead and for the two that finished stage 1
  await expect(stat("Ready to run")).toHaveText("3");
  await expect(stat("Pending")).toHaveText("1");
  await expect(stat("Running")).toHaveText("1");
});

test("the campaign's lead list searches, filters and opens a lead", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const campaign = await seed.createCampaign({
    name: `Leads ${id}`,
    status: "active",
  });
  const amy = await seed.createLead({
    skoolUsername: `e2e-${id}-amy`,
    name: `Amy ${id}`,
    emails: [`amy-${id}@example.com`],
    website: "https://amy.example.com",
    linkedinUrl: "https://linkedin.com/in/amy",
  });
  const ben = await seed.createLead({
    skoolUsername: `e2e-${id}-ben`,
    name: `Ben ${id}`,
  });
  const cat = await seed.createLead({
    skoolUsername: `e2e-${id}-cat`,
    name: `Cat ${id}`,
  });
  await seed.createCommunity({
    leadId: cat.leadId,
    skoolId: `skool-${id}`,
    name: `club-${id}`,
    displayName: `Sunrise ${id}`,
    memberCount: 321,
  });
  await seed.attachCampaignLeads({
    campaignId: campaign.campaignId,
    leads: [
      { leadId: amy.leadId, stage: 1, status: "done", keyword: `yoga ${id}` },
      { leadId: ben.leadId, stage: 1, status: "pending" },
      {
        leadId: cat.leadId,
        stage: 2,
        status: "pending",
        keyword: `chess ${id}`,
      },
    ],
  });
  const rows = (text: string) =>
    page.getByRole("row").filter({ hasText: text });

  await page.goto(`/admin/campaigns/${campaign.campaignId}`);
  await expect(rows(id)).toHaveCount(3);

  const amyRow = rows(`Amy ${id}`);
  await expect(amyRow).toContainText(`yoga ${id}`);
  await expect(
    amyRow.getByRole("link", { name: `amy-${id}@example.com` }),
  ).toHaveAttribute("href", `mailto:amy-${id}@example.com`);
  await expect(
    amyRow.getByRole("link", { name: "linkedin.com/in/amy" }),
  ).toBeVisible();
  await expect(
    amyRow.getByRole("link", { name: "amy.example.com" }),
  ).toHaveAttribute("target", "_blank");
  await expect(rows(`Ben ${id}`)).toContainText("—");

  await page
    .getByPlaceholder("Search by lead, username or community")
    .fill(`Sunrise ${id}`);
  await expect(rows(id)).toHaveCount(1);
  await expect(rows(`Cat ${id}`)).toContainText("321");
  await page.getByPlaceholder("Search by lead, username or community").fill("");

  await page.getByRole("combobox").filter({ hasText: "Any status" }).click();
  await page.getByRole("option", { name: "Pending", exact: true }).click();
  await expect(rows(`Amy ${id}`)).toHaveCount(0);
  await expect(rows(id)).toHaveCount(2);

  await page.getByRole("tab", { name: /Stage 2/ }).click();
  await expect(rows(id)).toHaveCount(1);
  await expect(rows(`Cat ${id}`)).toHaveCount(1);

  await page.getByRole("combobox").filter({ hasText: "Pending" }).click();
  await page.getByRole("option", { name: "Failed", exact: true }).click();
  await expect(page.getByText("No leads match these filters.")).toBeVisible();

  await page.goto(`/admin/campaigns/${campaign.campaignId}`);
  await amyRow.getByText(`Amy ${id}`).click();
  await expect(page).toHaveURL(new RegExp(`/admin/leads/${amy.leadId}$`));
});

test("clicking a link inside a campaign lead row does not open the lead", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const campaign = await seed.createCampaign({ name: `Links ${id}` });
  const lead = await seed.createLead({
    skoolUsername: `e2e-${id}`,
    name: `Linked ${id}`,
    emails: [`linked-${id}@example.com`],
  });
  await seed.attachCampaignLeads({
    campaignId: campaign.campaignId,
    leads: [{ leadId: lead.leadId, stage: 1, status: "done" }],
  });

  await page.goto(`/admin/campaigns/${campaign.campaignId}`);
  // The mailto link is handed to the browser, so only the page's own navigation is observed
  await page.getByRole("link", { name: `linked-${id}@example.com` }).click();
  await expect(page).toHaveURL(
    new RegExp(`/admin/campaigns/${campaign.campaignId}(\\?|$)`),
  );
});

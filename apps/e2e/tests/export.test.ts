import { test, expect } from "../fixtures";
import { readCsv, token } from "./support";

const exportButton = (page: import("@playwright/test").Page) =>
  page.getByRole("button", { name: "Export CSV" });

const exportNow = async (page: import("@playwright/test").Page) => {
  const download = page.waitForEvent("download");
  await exportButton(page).click();

  return await download;
};

test("exporting the lead list downloads every lead matching the search, across pages", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  for (let index = 1; index <= 13; index += 1) {
    await seed.createLead({
      skoolUsername: `e2e-${id}-${String(index).padStart(2, "0")}`,
      name: `Lead ${id} ${String(index).padStart(2, "0")}`,
    });
  }
  await seed.createLead({
    skoolUsername: `other-${id}`,
    name: `Unrelated ${id}`,
  });

  await page.goto(`/admin/leads?search=e2e-${id}&sortBy=name&sortOrder=asc`);
  await expect(
    page.getByRole("row").filter({ hasText: `Lead ${id}` }),
  ).toHaveCount(12);

  const download = await exportNow(page);

  expect(download.suggestedFilename()).toMatch(
    /^leads-\d{4}-\d{2}-\d{2}\.csv$/,
  );
  const rows = await readCsv(download);
  // Only 12 rows are on screen, but the export has every match
  expect(rows.map((row) => row["Skool username"])).toEqual(
    Array.from(
      { length: 13 },
      (_, index) => `e2e-${id}-${String(index + 1).padStart(2, "0")}`,
    ),
  );
  expect(rows[0]).toMatchObject({ Name: `Lead ${id} 01` });
});

test("the lead export follows the website filter and the sort order", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  await seed.createLead({
    skoolUsername: `e2e-${id}-a`,
    name: `Alice ${id}`,
    website: "https://alice.example.com",
  });
  await seed.createLead({ skoolUsername: `e2e-${id}-b`, name: `Bob ${id}` });
  await seed.createLead({
    skoolUsername: `e2e-${id}-c`,
    name: `Carol ${id}`,
    website: "https://carol.example.com",
  });

  await page.goto(
    `/admin/leads?search=${id}&hasWebsite=true&sortBy=name&sortOrder=desc`,
  );
  await expect(
    page.getByRole("row").filter({ hasText: `Carol ${id}` }),
  ).toHaveCount(1);

  const rows = await readCsv(await exportNow(page));

  expect(rows.map((row) => row["Name"])).toEqual([
    `Carol ${id}`,
    `Alice ${id}`,
  ]);
  expect(rows.map((row) => row["Website"])).toEqual([
    "https://carol.example.com",
    "https://alice.example.com",
  ]);
});

test("a lead's emails and awkward text survive the round trip through the file", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  await seed.createLead({
    skoolUsername: `e2e-${id}`,
    name: `Odd, "Name" ${id}`,
    emails: [`one-${id}@example.com`, `two-${id}@example.com`],
    bio: "First line\nSecond line",
  });

  await page.goto(`/admin/leads?search=${id}`);
  await expect(page.getByRole("row").filter({ hasText: id })).toHaveCount(1);
  const [row] = await readCsv(await exportNow(page));

  expect(row).toMatchObject({
    Name: `Odd, "Name" ${id}`,
    Emails: `one-${id}@example.com; two-${id}@example.com`,
    Bio: "First line\nSecond line",
  });
});

test("exporting from the card view gives the same file", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  await seed.createLead({ skoolUsername: `e2e-${id}`, name: `Lead ${id}` });

  await page.goto(`/admin/leads?search=${id}`);
  await page.getByRole("button", { name: "Card view" }).click();
  const rows = await readCsv(await exportNow(page));

  expect(rows.map((row) => row["Name"])).toEqual([`Lead ${id}`]);
});

test("exporting communities respects the filters sheet", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const lead = await seed.createLead({
    skoolUsername: `e2e-${id}`,
    name: `Owner ${id}`,
  });
  await seed.createCommunity({
    leadId: lead.leadId,
    skoolId: `skool-${id}-free`,
    name: `free-${id}`,
    displayName: `Free ${id}`,
    memberCount: 50,
  });
  await seed.createCommunity({
    leadId: lead.leadId,
    skoolId: `skool-${id}-mid`,
    name: `mid-${id}`,
    displayName: `Mid ${id}`,
    memberCount: 100,
    monthlyPrice: 2900,
  });
  await seed.createCommunity({
    leadId: lead.leadId,
    skoolId: `skool-${id}-big`,
    name: `big-${id}`,
    displayName: `Big ${id}`,
    memberCount: 500,
    monthlyPrice: 1000,
  });

  await page.goto(`/admin/communities?search=${id}`);
  const everything = await readCsv(await exportNow(page));
  expect(everything.map((row) => row["Slug"]).toSorted()).toEqual([
    `big-${id}`,
    `free-${id}`,
    `mid-${id}`,
  ]);

  await page.getByRole("button", { name: "Filters" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("combobox").filter({ hasText: "Any pricing" }).click();
  await page.getByRole("option", { name: "Paid", exact: true }).click();
  await sheet.getByLabel("Min. members").fill("100");
  await sheet.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/pricingType=paid/);
  await expect(
    page.getByRole("row").filter({ hasText: `Free ${id}` }),
  ).toHaveCount(0);

  const filtered = await readCsv(await exportNow(page));
  expect(filtered.map((row) => row["Slug"]).toSorted()).toEqual([
    `big-${id}`,
    `mid-${id}`,
  ]);
  const mid = filtered.find((row) => row["Slug"] === `mid-${id}`);
  expect(mid).toMatchObject({
    Community: `Mid ${id}`,
    Owner: `Owner ${id}`,
    Members: "100",
    Pricing: "paid",
    Price: "29",
    Currency: "USD",
  });
});

test("exporting campaigns follows the status filter and includes each campaign's own lead count", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const active = await seed.createCampaign({
    name: `Alpha ${id}`,
    status: "active",
    keywords: ["yoga", "pilates"],
  });
  await seed.createCampaign({ name: `Beta ${id}`, status: "paused" });
  const lead = await seed.createLead({
    skoolUsername: `e2e-${id}`,
    name: `Lead ${id}`,
  });
  await seed.attachCampaignLeads({
    campaignId: active.campaignId,
    leads: [{ leadId: lead.leadId, stage: 1, status: "done" }],
  });

  await page.goto(`/admin/campaigns?search=${id}`);
  const both = await readCsv(await exportNow(page));
  expect(
    Object.fromEntries(both.map((row) => [row["Name"], row["Leads"]])),
  ).toEqual({
    [`Alpha ${id}`]: "1",
    [`Beta ${id}`]: "0",
  });

  await page.getByRole("combobox").filter({ hasText: "All statuses" }).click();
  await page.getByRole("option", { name: "Active", exact: true }).click();
  await expect(page).toHaveURL(/status=active/);
  const filtered = await readCsv(await exportNow(page));
  expect(filtered).toHaveLength(1);
  expect(filtered[0]).toMatchObject({
    Name: `Alpha ${id}`,
    Status: "active",
    Keywords: "yoga; pilates",
  });
});

test("exporting a campaign's leads follows its stage tab, status and search", async ({
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
  });
  const ben = await seed.createLead({
    skoolUsername: `e2e-${id}-ben`,
    name: `Ben ${id}`,
  });
  const cat = await seed.createLead({
    skoolUsername: `e2e-${id}-cat`,
    name: `Cat ${id}`,
  });
  await seed.attachCampaignLeads({
    campaignId: campaign.campaignId,
    leads: [
      { leadId: amy.leadId, stage: 1, status: "done", keyword: `yoga ${id}` },
      { leadId: ben.leadId, stage: 1, status: "pending" },
      { leadId: cat.leadId, stage: 2, status: "pending" },
    ],
  });

  await page.goto(`/admin/campaigns/${campaign.campaignId}`);
  await expect(page.getByRole("row").filter({ hasText: id })).toHaveCount(3);
  const everything = await exportNow(page);
  expect(everything.suggestedFilename()).toMatch(
    new RegExp(
      `^campaign-${campaign.campaignId}-leads-\\d{4}-\\d{2}-\\d{2}\\.csv$`,
    ),
  );
  expect(
    (await readCsv(everything)).map((row) => row["Skool username"]).toSorted(),
  ).toEqual([`e2e-${id}-amy`, `e2e-${id}-ben`, `e2e-${id}-cat`]);

  await page.getByRole("tab", { name: /Stage 1/ }).click();
  await expect(page.getByRole("row").filter({ hasText: id })).toHaveCount(2);
  await page.getByRole("combobox").filter({ hasText: "Any status" }).click();
  await page.getByRole("option", { name: "Done", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: id })).toHaveCount(1);

  const filtered = await readCsv(await exportNow(page));
  expect(filtered).toHaveLength(1);
  expect(filtered[0]).toMatchObject({
    Lead: `Amy ${id}`,
    Keyword: `yoga ${id}`,
    Emails: `amy-${id}@example.com`,
    Stage: "1",
    Status: "done",
  });
});

test("the export button shows progress while it works and a failure downloads nothing", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  await seed.createLead({ skoolUsername: `e2e-${id}`, name: `Lead ${id}` });
  let downloads = 0;
  page.on("download", () => {
    downloads += 1;
  });

  await page.goto(`/admin/leads?search=${id}`);
  await page.route(
    (url) => url.pathname === "/api/leads/export",
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ statusCode: 500, message: "Export failed" }),
      });
    },
  );

  await exportButton(page).click();
  await expect(exportButton(page)).toBeDisabled();
  await expect(exportButton(page)).toBeEnabled();
  expect(downloads).toBe(0);

  await page.unrouteAll({ behavior: "ignoreErrors" });
  const rows = await readCsv(await exportNow(page));
  expect(rows).toHaveLength(1);
});

test("every list offers the export on a phone too", async ({
  browser,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  const context = await browser.newContext({
    viewport: { width: 375, height: 800 },
  });
  await seed.authenticate(context, admin.email);
  const page = await context.newPage();
  const campaign = await seed.createCampaign({ name: `Phone ${token()}` });

  for (const path of [
    "/admin/leads",
    "/admin/communities",
    "/admin/campaigns",
    `/admin/campaigns/${campaign.campaignId}`,
  ]) {
    await page.goto(path);
    await expect(exportButton(page)).toBeVisible();
  }
  await context.close();
});

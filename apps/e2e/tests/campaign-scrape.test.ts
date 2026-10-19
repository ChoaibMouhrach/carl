import { test, expect } from "../fixtures";
import type { Page } from "@playwright/test";
import { club, token } from "./support";

type Seed = Parameters<Parameters<typeof test>[2]>[0]["seed"];

const status = (page: Page, name: string) =>
  page
    .locator('[data-slot="badge"]')
    .filter({ hasText: new RegExp(`^${name}$`) });

const runScrape = async (page: Page, campaignId: number) => {
  await page.goto(`/admin/campaigns/${campaignId}?stage=1`);
  await runButton(page).click();
};

// The spinner inside a running button adds to its accessible name, so match the end of it
const runButton = (page: Page) =>
  page.getByRole("button", { name: /Run scrape$/ });

const latestRun = async (seed: Seed, campaignId: number) =>
  (await seed.listScrapeRuns(campaignId))[0];

test("running a scrape finds communities and adds their owners to the campaign at stage 1", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const keyword = `kw ${id}`;
  const script = {
    keyword,
    searches: {
      "public-paid": [
        club(id, { suffix: "a", members: 120, price: 2900 }),
        club(id, { suffix: "b", members: 40 }),
      ],
    },
  };
  await seed.scriptSkool(script);
  const campaign = await seed.createCampaign({
    name: `Scrape ${id}`,
    keywords: [keyword],
    status: "active",
  });

  try {
    await runScrape(page, campaign.campaignId);
    await expect(status(page, "Completed")).toBeVisible();

    const run = await latestRun(seed, campaign.campaignId);
    expect(run).toMatchObject({
      status: "completed",
      error: null,
      summary: {
        discovered: 2,
        communitiesCreated: 2,
        leadsCreated: 2,
        leadsAttached: 2,
        failures: [],
      },
    });
    expect(await seed.listCampaignLeads(campaign.campaignId)).toEqual([
      expect.objectContaining({
        skoolUsername: `e2e-${id}-a`,
        stage: 1,
        status: "done",
        keyword,
      }),
      expect.objectContaining({
        skoolUsername: `e2e-${id}-b`,
        stage: 1,
        status: "done",
        keyword,
      }),
    ]);
    expect(
      await seed.findCommunityBySkoolId(`scripted-club-${id}-a`),
    ).toMatchObject({
      memberCount: 120,
      pricingType: "paid",
      priceAmount: 2900,
      monthlyPriceUsd: 29,
    });
    expect(await seed.findLeadByUsername(`e2e-${id}-a`)).toMatchObject({
      emails: [`a-${id}@example.com`],
    });

    const rows = page.getByRole("row").filter({ hasText: id });
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: `Owner a ${id}` })).toContainText(
      keyword,
    );
    await expect(rows.filter({ hasText: `Owner a ${id}` })).toContainText(
      "Done",
    );
    await expect(rows.filter({ hasText: `Owner a ${id}` })).toContainText(
      "Stage 1",
    );
  } finally {
    await seed.unscriptSkool(script);
  }
});

test("a campaign that is not active cannot be scraped", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const draft = await seed.createCampaign({ name: `Draft ${id}` });
  const paused = await seed.createCampaign({
    name: `Paused ${id}`,
    status: "paused",
  });
  const active = await seed.createCampaign({
    name: `Active ${id}`,
    status: "active",
  });

  for (const campaign of [draft, paused]) {
    await page.goto(`/admin/campaigns/${campaign.campaignId}?stage=1`);
    await expect(runButton(page)).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Replace leads and scrape" }),
    ).toBeDisabled();
    await expect(
      page.getByText("Activate the campaign to run its stages."),
    ).toBeVisible();
  }

  await page.goto(`/admin/campaigns/${active.campaignId}?stage=1`);
  await expect(runButton(page)).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Replace leads and scrape" }),
  ).toBeEnabled();

  // No run was ever created for the campaigns that could not start one
  expect(await seed.listScrapeRuns(draft.campaignId)).toEqual([]);
  expect(await seed.listScrapeRuns(paused.campaignId)).toEqual([]);
});

test("a scrape that cannot reach Skool shows why, adds nothing and can be run again", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const keyword = `kw ${id}`;
  const failing = {
    keyword,
    searches: {},
    failDiscovery: `Skool is down ${id}`,
  };
  await seed.scriptSkool(failing);
  const campaign = await seed.createCampaign({
    name: `Failing ${id}`,
    keywords: [keyword],
    status: "active",
  });
  const working = {
    keyword,
    searches: { "public-paid": [club(id, { suffix: "a", price: 1000 })] },
  };

  try {
    await runScrape(page, campaign.campaignId);
    await expect(status(page, "Failed")).toBeVisible();
    await expect(page.getByText(`Skool is down ${id}`)).toBeVisible();

    const failed = await latestRun(seed, campaign.campaignId);
    expect(failed).toMatchObject({
      status: "failed",
      error: `Skool is down ${id}`,
    });
    expect(await seed.listCampaignLeads(campaign.campaignId)).toEqual([]);
    expect(await seed.findLeadByUsername(`e2e-${id}-a`)).toBeNull();

    await seed.scriptSkool(working);
    await runButton(page).click();
    await expect(status(page, "Completed")).toBeVisible();

    const runs = await seed.listScrapeRuns(campaign.campaignId);
    expect(runs.map((run) => run.status)).toEqual(["completed", "failed"]);
    expect(await seed.listCampaignLeads(campaign.campaignId)).toHaveLength(1);
  } finally {
    await seed.unscriptSkool(failing);
    await seed.unscriptSkool(working);
  }
});

test("a member limit drops small communities before anything is stored", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const keyword = `kw ${id}`;
  const script = {
    keyword,
    searches: {
      "public-paid": [
        club(id, { suffix: "big", members: 500, price: 1000 }),
        club(id, { suffix: "tiny", members: 5, price: 1000 }),
      ],
    },
  };
  await seed.scriptSkool(script);
  const campaign = await seed.createCampaign({
    name: `Limit ${id}`,
    keywords: [keyword],
    status: "active",
    minMembers: 100,
  });

  try {
    await runScrape(page, campaign.campaignId);
    await expect(status(page, "Completed")).toBeVisible();

    expect((await latestRun(seed, campaign.campaignId))?.summary).toMatchObject(
      {
        discovered: 2,
        communitiesCreated: 1,
        filteredOut: 1,
      },
    );
    // The dropped community leaves no trace: no community and no owner
    expect(
      await seed.findCommunityBySkoolId(`scripted-club-${id}-tiny`),
    ).toBeNull();
    expect(await seed.findLeadByUsername(`e2e-${id}-tiny`)).toBeNull();
    expect(await seed.findLeadByUsername(`e2e-${id}-big`)).not.toBeNull();
    await expect(page.getByRole("row").filter({ hasText: id })).toHaveCount(1);
  } finally {
    await seed.unscriptSkool(script);
  }
});

test("several keywords are searched and each lead shows the keyword that found it", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const first = {
    keyword: `first ${id}`,
    searches: {
      "public-paid": [
        club(id, { suffix: "a", price: 1000 }),
        club(id, { suffix: "shared", price: 1000 }),
      ],
    },
  };
  const second = {
    keyword: `second ${id}`,
    searches: {
      "public-paid": [
        club(id, { suffix: "shared", price: 1000 }),
        club(id, { suffix: "b", price: 1000 }),
      ],
    },
  };
  await seed.scriptSkool(first);
  await seed.scriptSkool(second);
  const campaign = await seed.createCampaign({
    name: `Keywords ${id}`,
    keywords: [first.keyword, second.keyword],
    status: "active",
  });

  try {
    await runScrape(page, campaign.campaignId);
    await expect(status(page, "Completed")).toBeVisible();

    const rows = page.getByRole("row").filter({ hasText: id });
    await expect(rows).toHaveCount(3);
    await expect(rows.filter({ hasText: `Owner a ${id}` })).toContainText(
      first.keyword,
    );
    await expect(rows.filter({ hasText: `Owner b ${id}` })).toContainText(
      second.keyword,
    );
    // A community both keywords find is fetched once and named after the first keyword
    await expect(rows.filter({ hasText: `Owner shared ${id}` })).toContainText(
      first.keyword,
    );

    const links = await seed.listCampaignLeads(campaign.campaignId);
    expect(links.map((link) => [link.skoolUsername, link.keyword])).toEqual([
      [`e2e-${id}-a`, first.keyword],
      [`e2e-${id}-b`, second.keyword],
      [`e2e-${id}-shared`, first.keyword],
    ]);
  } finally {
    await seed.unscriptSkool(first);
    await seed.unscriptSkool(second);
  }
});

test("a keyword with no results still completes and adds nothing", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const empty = { keyword: `empty ${id}`, searches: {} };
  const full = {
    keyword: `full ${id}`,
    searches: { "public-paid": [club(id, { suffix: "a", price: 1000 })] },
  };
  await seed.scriptSkool(empty);
  await seed.scriptSkool(full);
  const campaign = await seed.createCampaign({
    name: `Empty ${id}`,
    keywords: [empty.keyword, full.keyword],
    status: "active",
  });

  try {
    await runScrape(page, campaign.campaignId);
    await expect(status(page, "Completed")).toBeVisible();

    expect((await latestRun(seed, campaign.campaignId))?.summary).toMatchObject(
      {
        discovered: 1,
        failures: [],
      },
    );
    expect(await seed.listCampaignLeads(campaign.campaignId)).toHaveLength(1);
  } finally {
    await seed.unscriptSkool(empty);
    await seed.unscriptSkool(full);
  }
});

test("a community that cannot be read is counted as failed while the others are added", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const keyword = `kw ${id}`;
  const script = {
    keyword,
    searches: {
      "public-paid": [
        club(id, { suffix: "ok", price: 1000 }),
        club(id, { suffix: "broken", price: 1000, failAbout: true }),
        club(id, { suffix: "orphan", price: 1000, owner: false }),
      ],
    },
  };
  await seed.scriptSkool(script);
  const campaign = await seed.createCampaign({
    name: `Partial ${id}`,
    keywords: [keyword],
    status: "active",
  });

  try {
    await runScrape(page, campaign.campaignId);
    await expect(status(page, "Completed")).toBeVisible();

    const run = await latestRun(seed, campaign.campaignId);
    expect(run?.summary?.failures).toHaveLength(2);
    expect(run?.summary).toMatchObject({
      communitiesCreated: 1,
      leadsAttached: 1,
    });
    expect(await seed.findLeadByUsername(`e2e-${id}-ok`)).not.toBeNull();
    expect(await seed.findLeadByUsername(`e2e-${id}-broken`)).toBeNull();
    await expect(page.getByRole("row").filter({ hasText: id })).toHaveCount(1);
  } finally {
    await seed.unscriptSkool(script);
  }
});

test("scraping again keeps a lead's progress and adds only what is new", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const keyword = `kw ${id}`;
  const script = {
    keyword,
    searches: {
      "public-paid": [
        club(id, { suffix: "a", price: 1000 }),
        club(id, { suffix: "b", price: 1000 }),
      ],
    },
  };
  await seed.scriptSkool(script);
  const campaign = await seed.createCampaign({
    name: `Again ${id}`,
    keywords: [keyword],
    status: "active",
  });
  const advanced = await seed.createLead({
    skoolUsername: `e2e-${id}-a`,
    name: `Advanced ${id}`,
  });
  await seed.attachCampaignLeads({
    campaignId: campaign.campaignId,
    leads: [
      {
        leadId: advanced.leadId,
        stage: 3,
        status: "failed",
        keyword: "earlier",
      },
    ],
  });

  try {
    await runScrape(page, campaign.campaignId);
    await expect(status(page, "Completed")).toBeVisible();

    const afterFirst = await seed.listCampaignLeads(campaign.campaignId);
    expect(
      afterFirst.map((link) => [
        link.skoolUsername,
        link.stage,
        link.status,
        link.keyword,
      ]),
    ).toEqual([
      [`e2e-${id}-a`, 3, "failed", "earlier"],
      [`e2e-${id}-b`, 1, "done", keyword],
    ]);

    await runButton(page).click();
    await expect
      .poll(async () => (await seed.listScrapeRuns(campaign.campaignId)).length)
      .toBe(2);
    await expect
      .poll(async () => (await latestRun(seed, campaign.campaignId))?.status)
      .toBe("completed");

    expect(await seed.listCampaignLeads(campaign.campaignId)).toEqual(
      afterFirst,
    );
    expect((await latestRun(seed, campaign.campaignId))?.summary).toMatchObject(
      {
        alreadyKnown: 2,
        communitiesCreated: 0,
        leadsCreated: 0,
      },
    );
  } finally {
    await seed.unscriptSkool(script);
  }
});

test("replace and scrape drops unfound stage 1 leads, keeps advanced ones, and cancelling does nothing", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const keyword = `kw ${id}`;
  const script = {
    keyword,
    searches: { "public-paid": [club(id, { suffix: "new", price: 1000 })] },
  };
  await seed.scriptSkool(script);
  const campaign = await seed.createCampaign({
    name: `Replace ${id}`,
    keywords: [keyword],
    status: "active",
  });
  const stale = await seed.createLead({
    skoolUsername: `e2e-${id}-stale`,
    name: `Stale ${id}`,
  });
  const advanced = await seed.createLead({
    skoolUsername: `e2e-${id}-advanced`,
    name: `Advanced ${id}`,
  });
  await seed.attachCampaignLeads({
    campaignId: campaign.campaignId,
    leads: [
      { leadId: stale.leadId, stage: 1, status: "done" },
      { leadId: advanced.leadId, stage: 2, status: "pending" },
    ],
  });

  try {
    await page.goto(`/admin/campaigns/${campaign.campaignId}?stage=1`);
    await page
      .getByRole("button", { name: "Replace leads and scrape" })
      .click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Cancel" })
      .click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    expect(await seed.listScrapeRuns(campaign.campaignId)).toEqual([]);
    expect(await seed.listCampaignLeads(campaign.campaignId)).toHaveLength(2);

    await page
      .getByRole("button", { name: "Replace leads and scrape" })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Replace and scrape" })
      .click();
    await expect(status(page, "Completed")).toBeVisible();

    const links = await seed.listCampaignLeads(campaign.campaignId);
    expect(links.map((link) => link.skoolUsername)).toEqual([
      `e2e-${id}-advanced`,
      `e2e-${id}-new`,
    ]);
    expect(await latestRun(seed, campaign.campaignId)).toMatchObject({
      replace: true,
      summary: { leadsAttached: 1, leadsRemoved: 1 },
    });
    // The lead itself is never deleted, only its place in the campaign
    expect(await seed.findLeadByUsername(`e2e-${id}-stale`)).not.toBeNull();
  } finally {
    await seed.unscriptSkool(script);
  }
});

test("a replace run that finds nothing removes nothing", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const keyword = `kw ${id}`;
  const script = { keyword, searches: {} };
  await seed.scriptSkool(script);
  const campaign = await seed.createCampaign({
    name: `Nothing ${id}`,
    keywords: [keyword],
    status: "active",
  });
  const lead = await seed.createLead({
    skoolUsername: `e2e-${id}`,
    name: `Safe ${id}`,
  });
  await seed.attachCampaignLeads({
    campaignId: campaign.campaignId,
    leads: [{ leadId: lead.leadId, stage: 1, status: "done" }],
  });

  try {
    await page.goto(`/admin/campaigns/${campaign.campaignId}?stage=1`);
    await page
      .getByRole("button", { name: "Replace leads and scrape" })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Replace and scrape" })
      .click();
    await expect(status(page, "Completed")).toBeVisible();

    expect(await seed.listCampaignLeads(campaign.campaignId)).toHaveLength(1);
    expect((await latestRun(seed, campaign.campaignId))?.summary).toMatchObject(
      { leadsRemoved: 0 },
    );
  } finally {
    await seed.unscriptSkool(script);
  }
});

test("while a scrape is running the scrape buttons and the lead selection are locked", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const campaign = await seed.createCampaign({
    name: `Busy ${id}`,
    status: "active",
  });
  const lead = await seed.createLead({
    skoolUsername: `e2e-${id}`,
    name: `Lead ${id}`,
  });
  await seed.attachCampaignLeads({
    campaignId: campaign.campaignId,
    leads: [{ leadId: lead.leadId, stage: 1, status: "done" }],
  });
  await seed.createScrapeRun({
    campaignId: campaign.campaignId,
    status: "running",
  });

  await page.goto(`/admin/campaigns/${campaign.campaignId}?stage=1`);

  await expect(status(page, "Running")).toBeVisible();
  await expect(runButton(page)).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Replace leads and scrape" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("checkbox", { name: "Select all" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("checkbox", { name: "Select item" }),
  ).toBeDisabled();

  await page.getByRole("button", { name: "Card view" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Select all" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("checkbox", { name: "Select item" }),
  ).toBeDisabled();
});

test("once the last run has finished the lead selection works again", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const campaign = await seed.createCampaign({
    name: `Idle ${id}`,
    status: "active",
  });
  const lead = await seed.createLead({
    skoolUsername: `e2e-${id}`,
    name: `Lead ${id}`,
  });
  await seed.attachCampaignLeads({
    campaignId: campaign.campaignId,
    leads: [{ leadId: lead.leadId, stage: 1, status: "done" }],
  });
  await seed.createScrapeRun({
    campaignId: campaign.campaignId,
    status: "completed",
  });

  await page.goto(`/admin/campaigns/${campaign.campaignId}?stage=1`);
  await page.getByRole("checkbox", { name: "Select all" }).click();

  await expect(page.getByText("1 selected")).toBeVisible();
  await page.getByRole("button", { name: "Clear selection" }).click();
  await expect(page.getByText("1 selected")).toHaveCount(0);
});

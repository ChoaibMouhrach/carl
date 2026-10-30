import type { Page } from "@playwright/test";
import { test as base, expect } from "../fixtures";
import { faker } from "@faker-js/faker";
import { API_URL } from "../config";

// Each test names its campaign after a token and removes it afterwards (its runs cascade)
const test = base.extend<{ id: string }>({
  id: async ({ seed }, use) => {
    const id = faker.string.uuid();
    await use(id);
    await seed.deleteCampaignsContaining(id);
  },
});

type Seed = Parameters<Parameters<typeof base>[2]>[0]["seed"];

const campaignName = (id: string) => `0-${id}`;

const stepCard = (page: Page, title: string) =>
  page.locator('[data-slot="card"]').filter({ hasText: title });

const funnelTile = (page: Page, title: string) =>
  page.getByRole("button", { name: new RegExp(`^\\d+\\s+${title}\\b`) });

const openCampaign = async (page: Page, seed: Seed, id: string, query = "") => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const campaign = await seed.createCampaign({
    name: campaignName(id),
    keyword: "pipeline",
  });

  return {
    campaign,
    open: () => page.goto(`/admin/campaigns/${campaign.campaignId}${query}`),
  };
};

const seedCommunities = async (
  seed: Seed,
  campaignId: number,
  id: string,
  count: number,
) => {
  const leadIds: number[] = [];
  const communityIds: number[] = [];

  for (let index = 1; index <= count; index += 1) {
    const lead = await seed.createLead({
      name: `Owner ${id} ${index}`,
      username: `owner-${id}-${index}`,
    });
    const community = await seed.createCommunity({
      leadId: lead.leadId,
      name: `Community ${id} ${index}`,
      slug: `community-${id}-${index}`,
      members: 100,
    });
    leadIds.push(lead.leadId);
    communityIds.push(community.communityId);
  }

  await seed.addLeadsToCampaign({ campaignId, leadIds });
  await seed.addCommunitiesToCampaign({ campaignId, communityIds });

  return { leadIds, communityIds };
};

test("a campaign that never ran offers a scrape, has nothing for the other steps and lists no leads", async ({
  page,
  seed,
  id,
}) => {
  const { campaign, open } = await openCampaign(page, seed, id);

  await open();

  await expect(page.getByRole("button", { name: "Run scrape" })).toBeEnabled();
  for (const title of ["3. Website"]) {
    await expect(stepCard(page, title).getByRole("button")).toBeDisabled();
  }
  await expect(funnelTile(page, "Scraped")).toContainText("0");
  await expect(page.getByText("No leads yet", { exact: true })).toBeVisible();
  expect(await seed.listPipelineRuns(campaign.campaignId)).toHaveLength(0);
});

test("a finished scrape shows its leads, and offers a rerun", async ({
  page,
  seed,
  id,
}) => {
  const { campaign, open } = await openCampaign(page, seed, id);
  const { leadIds } = await seedCommunities(seed, campaign.campaignId, id, 3);
  await seed.createPipelineRun({
    campaignId: campaign.campaignId,
    step: "scrape",
    status: "done",
    total: 3,
    processed: 3,
    results: leadIds.map((leadId) => ({ leadId })),
  });

  await open();

  for (const index of [1, 2, 3]) {
    await expect(
      page.getByRole("button", { name: `Owner ${id} ${index}`, exact: true }),
    ).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Run again" })).toBeEnabled();
  expect(await seed.listCampaignCommunityIds(campaign.campaignId)).toHaveLength(
    3,
  );
});

test("a running scrape shows its progress and cannot be started again", async ({
  page,
  seed,
  id,
}) => {
  const { campaign, open } = await openCampaign(page, seed, id);
  await seed.createPipelineRun({
    campaignId: campaign.campaignId,
    step: "scrape",
    status: "running",
    total: 10,
    processed: 4,
  });

  await open();

  await expect(page.getByText("4 of 10 communities")).toBeVisible();
  await expect(page.getByRole("button", { name: "Run again" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Run scrape" })).toHaveCount(0);
  expect(await seed.listPipelineRuns(campaign.campaignId)).toHaveLength(1);
});

test("a run that finishes while the page is open updates the progress and the button on its own", async ({
  page,
  seed,
  id,
}) => {
  const { campaign, open } = await openCampaign(page, seed, id);
  const { leadIds } = await seedCommunities(seed, campaign.campaignId, id, 4);
  const run = await seed.createPipelineRun({
    campaignId: campaign.campaignId,
    step: "scrape",
    status: "running",
    total: 4,
    processed: 1,
    results: leadIds.map((leadId) => ({ leadId })),
  });
  await open();
  await expect(page.getByText("1 of 4 communities")).toBeVisible();

  await seed.updatePipelineRun({
    runId: run.runId,
    status: "done",
    processed: 4,
  });

  await expect(page.getByText(/of 4 communities/)).toHaveCount(0, {
    timeout: 10_000,
  });
  await expect(page.getByRole("button", { name: "Run again" })).toBeEnabled();
  const [stored] = await seed.listPipelineRuns(campaign.campaignId);
  expect(stored).toMatchObject({ status: "done", processed: 4 });
});

test("an inactive campaign cannot run its pipeline, and activating it again can", async ({
  page,
  seed,
  id,
}) => {
  const { open } = await openCampaign(page, seed, id);
  await open();
  await expect(page.getByRole("button", { name: "Run scrape" })).toBeEnabled();

  await page.getByRole("button", { name: "Deactivate", exact: true }).click();

  await expect(page.getByRole("button", { name: "Run scrape" })).toBeDisabled();
  await expect
    .poll(
      async () => (await seed.findCampaignByName(campaignName(id)))?.isActive,
    )
    .toBe(false);

  await page.getByRole("button", { name: "Activate", exact: true }).click();

  await expect(page.getByRole("button", { name: "Run scrape" })).toBeEnabled();
  await expect
    .poll(
      async () => (await seed.findCampaignByName(campaignName(id)))?.isActive,
    )
    .toBe(true);
});

test("shows a skeleton while the pipeline loads", async ({
  page,
  seed,
  id,
}) => {
  const { campaign, open } = await openCampaign(page, seed, id);

  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    (url) => url.pathname === `/api/campaigns/${campaign.campaignId}/pipeline`,
    async (route) => {
      await gate;
      await route.continue();
    },
  );
  await open();

  await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible();
  release();
  await expect(page.getByRole("button", { name: "Run scrape" })).toBeVisible();
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
});

test("deleting a campaign from its page removes its pipeline runs and keeps its leads and communities", async ({
  page,
  seed,
  id,
}) => {
  const { campaign, open } = await openCampaign(page, seed, id);
  const { leadIds } = await seedCommunities(seed, campaign.campaignId, id, 2);
  await seed.createPipelineRun({
    campaignId: campaign.campaignId,
    step: "scrape",
    status: "done",
    total: 2,
    processed: 2,
  });
  await seed.createPipelineRun({
    campaignId: campaign.campaignId,
    step: "enrich",
    status: "failed",
    error: "x",
  });
  await open();

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();

  await expect(page).toHaveURL(/\/admin\/campaigns(\?|$)/);
  await expect.poll(() => seed.findCampaignByName(campaignName(id))).toBeNull();
  expect(await seed.listPipelineRuns(campaign.campaignId)).toEqual([]);
  expect(await seed.countLeadsWithPrefix(`owner-${id}`)).toBe(leadIds.length);
  expect(await seed.countCommunitiesWithPrefix(`community-${id}`)).toBe(2);
});

test("run progress arrives over the event stream step by step, without polling", async ({
  page,
  seed,
  id,
}) => {
  const { campaign, open } = await openCampaign(page, seed, id);
  const run = await seed.createPipelineRun({
    campaignId: campaign.campaignId,
    step: "scrape",
    status: "running",
    total: 4,
    processed: 1,
  });
  const pipelinePath = `/api/campaigns/${campaign.campaignId}/pipeline`;
  const pipelineLoads: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === pipelinePath) {
      pipelineLoads.push(request.url());
    }
  });
  const stream = page.waitForRequest(
    (request) => new URL(request.url()).pathname === `${pipelinePath}/events`,
  );

  await open();
  await stream;
  await expect(page.getByText("1 of 4 communities")).toBeVisible();

  for (const processed of [2, 3]) {
    await seed.updatePipelineRun({
      runId: run.runId,
      status: "running",
      processed,
    });
    await expect(page.getByText(`${processed} of 4 communities`)).toBeVisible();
    const [stored] = await seed.listPipelineRuns(campaign.campaignId);
    expect(stored).toMatchObject({ status: "running", processed });
  }

  expect(pipelineLoads).toHaveLength(1);
});

test("a run that fails while the page is open shows the failure and its reason", async ({
  page,
  seed,
  id,
}) => {
  const { campaign, open } = await openCampaign(page, seed, id);
  const run = await seed.createPipelineRun({
    campaignId: campaign.campaignId,
    step: "scrape",
    status: "running",
    total: 4,
    processed: 1,
  });
  await open();
  await expect(page.getByText("1 of 4 communities")).toBeVisible();

  await seed.updatePipelineRun({
    runId: run.runId,
    status: "failed",
    processed: 1,
    error: "Skool blocked the search",
  });

  await expect(page.getByText("The run failed")).toBeVisible();
  await expect(page.getByText("Skool blocked the search")).toBeVisible();
  await expect(page.getByRole("button", { name: "Run again" })).toBeEnabled();
  const [stored] = await seed.listPipelineRuns(campaign.campaignId);
  expect(stored).toMatchObject({
    status: "failed",
    error: "Skool blocked the search",
  });
});

test("a page only follows the runs of its own campaign", async ({
  page,
  seed,
  id,
}) => {
  const { campaign, open } = await openCampaign(page, seed, id);
  const other = await seed.createCampaign({
    name: `1-${id}`,
    keyword: "other",
  });
  await open();
  await expect(page.getByRole("button", { name: "Run scrape" })).toBeEnabled();

  await seed.createPipelineRun({
    campaignId: other.campaignId,
    step: "scrape",
    status: "running",
    total: 99,
    processed: 5,
  });
  await seed.createPipelineRun({
    campaignId: campaign.campaignId,
    step: "scrape",
    status: "running",
    total: 2,
    processed: 1,
  });

  await expect(page.getByText("1 of 2 communities")).toBeVisible();
  await expect(page.getByText(/of 99/)).toHaveCount(0);
  expect(await seed.listPipelineRuns(other.campaignId)).toHaveLength(1);
  expect(await seed.listPipelineRuns(campaign.campaignId)).toHaveLength(1);
});

test("a member cannot start FullEnrich or change its campaign's leads", async ({
  page,
  seed,
  id,
}) => {
  const member = await seed.createVerifiedMember();
  await seed.authenticate(page.context(), member.email);
  const campaign = await seed.createCampaign({
    name: campaignName(id),
    keyword: "protected",
  });
  const lead = await seed.createLead({
    name: `Protected ${id}`,
    username: `protected-${id}`,
    emails: [{ address: `${id}@example.com`, source: "fullenrich-work" }],
  });
  await seed.addLeadsToCampaign({
    campaignId: campaign.campaignId,
    leadIds: [lead.leadId],
  });

  const response = await page.request.post(
    `${API_URL}/api/campaigns/${campaign.campaignId}/pipeline/fullenrich`,
  );

  expect(response.status()).toBe(403);
  expect(await seed.listPipelineRuns(campaign.campaignId)).toEqual([]);
  expect(await seed.listCampaignLeadIds(campaign.campaignId)).toEqual([
    lead.leadId,
  ]);
  expect(await seed.findLeadByUsername(lead.username)).toMatchObject({
    emails: [{ address: `${id}@example.com`, source: "fullenrich-work" }],
    emailEnrichedAt: null,
  });
});

const seedFunnelLeads = async (seed: Seed, campaignId: number, id: string) => {
  const past = new Date("2026-01-01T00:00:00Z");
  const specs = [
    {
      key: "site",
      website: `https://${id}-site.invalid`,
      enrichedAt: past,
    },
    {
      key: "scraped",
      website: `https://${id}-scraped.invalid`,
      enrichedAt: past,
      websiteScrapedAt: past,
    },
    {
      key: "emailed",
      linkedin: `https://linkedin.com/in/${id}-emailed`,
      emails: [{ address: `${id}@example.com`, source: "fullenrich-work" }],
    },
    { key: "plain" },
  ] as const;
  const leadIds: number[] = [];

  for (const { key, ...fields } of specs) {
    const lead = await seed.createLead({
      name: `Owner ${id} ${key}`,
      username: `owner-${id}-${key}`,
      ...fields,
      emails: "emails" in fields ? [...fields.emails] : undefined,
    });
    leadIds.push(lead.leadId);
  }

  await seed.addLeadsToCampaign({ campaignId, leadIds });
};

test("the funnel counts the campaign's leads by what they have and each step shows how many it would run on", async ({
  page,
  seed,
  id,
}) => {
  const { campaign, open } = await openCampaign(page, seed, id);
  await seedFunnelLeads(seed, campaign.campaignId, id);

  await open();

  await expect(funnelTile(page, "Scraped")).toContainText("4");
  await expect(funnelTile(page, "Researched")).toContainText("3");
  await expect(funnelTile(page, "Contactable")).toContainText("3");
  await expect(funnelTile(page, "Has email")).toContainText("1");
  await expect(funnelTile(page, "Needs email")).toContainText("2");
  await expect(
    stepCard(page, "2. Tavily").getByRole("button", { name: "Run on 1" }),
  ).toBeVisible();
  await expect(
    stepCard(page, "3. Website").getByRole("button", { name: "Run on 1" }),
  ).toBeVisible();
  await expect(
    stepCard(page, "4. FullEnrich").getByRole("button", { name: "Run on 2" }),
  ).toBeVisible();
  expect(await seed.listPipelineRuns(campaign.campaignId)).toEqual([]);
});

test("including already-tried leads widens what the steps would run on", async ({
  page,
  seed,
  id,
}) => {
  const { campaign, open } = await openCampaign(page, seed, id);
  await seedFunnelLeads(seed, campaign.campaignId, id);
  await open();
  await expect(
    stepCard(page, "3. Website").getByRole("button", { name: "Run on 1" }),
  ).toBeVisible();

  await page
    .getByRole("switch", { name: "Include leads a step already tried" })
    .click();

  await expect(
    stepCard(page, "3. Website").getByRole("button", { name: "Run on 2" }),
  ).toBeVisible();
  await expect(
    stepCard(page, "2. Tavily").getByRole("button", { name: "Run on 3" }),
  ).toBeVisible();
});

test("a funnel tile filters the leads below it through the address", async ({
  page,
  seed,
  id,
}) => {
  const { campaign, open } = await openCampaign(page, seed, id);
  await seedFunnelLeads(seed, campaign.campaignId, id);
  await open();
  const owner = (key: string) =>
    page.getByRole("button", { name: `Owner ${id} ${key}`, exact: true });
  for (const key of ["site", "scraped", "emailed", "plain"]) {
    await expect(owner(key)).toBeVisible();
  }

  await funnelTile(page, "Needs email").click();

  await expect(page).toHaveURL(/stage=needsEmail/);
  await expect(owner("site")).toBeVisible();
  await expect(owner("scraped")).toBeVisible();
  await expect(owner("emailed")).toHaveCount(0);
  await expect(owner("plain")).toHaveCount(0);

  await funnelTile(page, "Scraped").click();

  await expect(page).not.toHaveURL(/stage=/);
  await expect(owner("plain")).toBeVisible();
});

test("the website step runs only on the leads that are eligible and stores a run sized to them", async ({
  page,
  seed,
  id,
}) => {
  const { campaign, open } = await openCampaign(page, seed, id);
  await seedFunnelLeads(seed, campaign.campaignId, id);
  await open();

  const started = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/pipeline/website`) &&
      response.request().method() === "POST",
  );
  await stepCard(page, "3. Website")
    .getByRole("button", { name: "Run on 1" })
    .click();

  expect((await started).status()).toBe(202);
  await expect
    .poll(async () =>
      (await seed.listPipelineRuns(campaign.campaignId)).filter(
        (run) => run.step === "website",
      ),
    )
    .toMatchObject([{ total: 1 }]);
});

test("when a website run finishes with emails the funnel moves those leads out of what FullEnrich would pay for", async ({
  page,
  seed,
  id,
}) => {
  const { campaign, open } = await openCampaign(page, seed, id);
  const past = new Date("2026-01-01T00:00:00Z");
  const found = await seed.createLead({
    name: `Owner ${id} found`,
    username: `owner-${id}-found`,
    website: `https://${id}-found.invalid`,
    enrichedAt: past,
  });
  const silent = await seed.createLead({
    name: `Owner ${id} silent`,
    username: `owner-${id}-silent`,
    website: `https://${id}-silent.invalid`,
    enrichedAt: past,
  });
  await seed.addLeadsToCampaign({
    campaignId: campaign.campaignId,
    leadIds: [found.leadId, silent.leadId],
  });
  const run = await seed.createPipelineRun({
    campaignId: campaign.campaignId,
    step: "website",
    status: "running",
    total: 2,
    processed: 0,
  });
  await open();
  const fullenrich = stepCard(page, "4. FullEnrich");
  await expect(
    fullenrich.getByRole("button", { name: "Run on 2" }),
  ).toBeVisible();
  await expect(funnelTile(page, "Has email")).toContainText("0");
  await expect(funnelTile(page, "Needs email")).toContainText("2");

  await seed.addLeadEmails({
    leadId: found.leadId,
    emails: [{ address: `${id}@found.invalid`, source: "website" }],
  });
  await seed.updatePipelineRun({
    runId: run.runId,
    status: "done",
    processed: 2,
  });

  await expect(
    fullenrich.getByRole("button", { name: "Run on 1" }),
  ).toBeVisible();
  await expect(funnelTile(page, "Has email")).toContainText("1");
  await expect(funnelTile(page, "Needs email")).toContainText("1");
  expect(await seed.findLeadByUsername(found.username)).toMatchObject({
    emails: [{ address: `${id}@found.invalid`, source: "website" }],
  });
  expect(await seed.findLeadByUsername(silent.username)).toMatchObject({
    emails: [],
    emailEnrichedAt: null,
  });
  expect(
    (await seed.listPipelineRuns(campaign.campaignId)).map((stored) => ({
      step: stored.step,
      status: stored.status,
    })),
  ).toEqual([{ step: "website", status: "done" }]);
});

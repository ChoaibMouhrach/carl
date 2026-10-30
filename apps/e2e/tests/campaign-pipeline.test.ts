import type { Page } from "@playwright/test";
import { test as base, expect } from "../fixtures";
import { faker } from "@faker-js/faker";
import { API_URL } from "../config";
import { createServer } from "node:http";

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

const stepper = (page: Page, title: string) =>
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

test("website scraping persists emails from real pages, streams completion and keeps sources on rerun", async ({
  page,
  seed,
  id,
}) => {
  const { campaign, open } = await openCampaign(
    page,
    seed,
    id,
    "?step=website",
  );
  const foundEmail = `found-${id}@gmail.com`;
  const existingEmail = `existing-${id}@gmail.com`;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const website = createServer((request, response) => {
    void gate.then(() => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(
        request.url === "/contact"
          ? `<a href="mailto:${foundEmail}">Contact</a> ${existingEmail}`
          : foundEmail.toUpperCase(),
      );
    });
  });
  await new Promise<void>((resolve) => {
    website.listen(0, "0.0.0.0", resolve);
  });
  const address = website.address();
  if (!address || typeof address === "string")
    throw new Error("Missing website port");

  try {
    const lead = await seed.createLead({
      name: `Website ${id}`,
      username: `website-${id}`,
      website: `http://${process.env.CI ? "host.docker.internal" : "127.0.0.1"}:${address.port}`,
      emails: [{ address: existingEmail, source: "skool" }],
    });
    await seed.addLeadsToCampaign({
      campaignId: campaign.campaignId,
      leadIds: [lead.leadId],
    });
    await seed.createPipelineRun({
      campaignId: campaign.campaignId,
      step: "scrape",
      status: "done",
      results: [{ leadId: lead.leadId }],
    });
    await seed.createPipelineRun({
      campaignId: campaign.campaignId,
      step: "enrich",
      status: "done",
      results: [{ leadId: lead.leadId, website: lead.website }],
    });
    await open();
    await expect(
      page.getByRole("button", { name: "Scrape websites", exact: true }),
    ).toBeVisible();
    const started = page.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith(`/api/campaigns/${campaign.campaignId}/pipeline/website`) &&
        response.request().method() === "POST",
    );

    await page
      .getByRole("button", { name: "Scrape websites", exact: true })
      .click();

    const response = await started;
    expect(response.status()).toBe(202);
    await expect(stepper(page, "Website")).toContainText("Running");
    await expect(
      page.getByRole("button", { name: /Run again$/ }),
    ).toBeDisabled();
    await expect
      .poll(async () => {
        const runs = await seed.listPipelineRuns(campaign.campaignId);
        return runs.filter((run) => run.step === "website");
      })
      .toMatchObject([
        { status: "running", total: 1, processed: 0, failed: 0 },
      ]);
    expect(await seed.findLeadByUsername(lead.username)).toMatchObject({
      emails: [{ address: existingEmail, source: "skool" }],
    });
    release();

    await expect(stepper(page, "Website")).toContainText("Done");
    await expect(stepper(page, "Website")).toContainText("1 with email");
    await expect(
      page.getByRole("link", { name: foundEmail, exact: true }),
    ).toHaveAttribute("href", `mailto:${foundEmail}`);
    await expect
      .poll(async () => {
        const stored = await seed.findLeadByUsername(lead.username);
        return stored?.emails;
      })
      .toEqual([
        { address: existingEmail, source: "skool" },
        { address: foundEmail, source: "website" },
      ]);

    await page.getByRole("button", { name: "Run again", exact: true }).click();

    await expect
      .poll(async () => {
        const runs = await seed.listPipelineRuns(campaign.campaignId);
        return runs
          .filter((run) => run.step === "website")
          .map((run) => ({
            status: run.status,
            total: run.total,
            processed: run.processed,
            failed: run.failed,
          }));
      })
      .toEqual([
        { status: "done", total: 1, processed: 1, failed: 0 },
        { status: "done", total: 1, processed: 1, failed: 0 },
      ]);
    expect(await seed.findLeadByUsername(lead.username)).toMatchObject({
      emails: [
        { address: existingEmail, source: "skool" },
        { address: foundEmail, source: "website" },
      ],
    });
    await page.reload();
    await expect(page).toHaveURL(/step=website/);
    await expect(stepper(page, "Website")).toContainText("1 with email");
    await page.getByRole("button", { name: lead.name, exact: true }).click();
    const sheet = page.getByRole("dialog");
    await expect(
      sheet.getByRole("link", { name: foundEmail, exact: true }),
    ).toBeVisible();
    await expect(
      sheet.locator('[data-slot="badge"]').filter({ hasText: /^Website$/ }),
    ).toBeVisible();
    await expect(sheet.getByText("Skool", { exact: true })).toBeVisible();
  } finally {
    release();
    website.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      website.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

for (const status of ["missing", "running", "failed"] satisfies Array<
  "missing" | "running" | "failed"
>) {
  test(`website scraping waits when enrichment is ${status}`, async ({
    page,
    seed,
    id,
  }) => {
    const { campaign, open } = await openCampaign(
      page,
      seed,
      id,
      "?step=website",
    );
    await seed.createPipelineRun({
      campaignId: campaign.campaignId,
      step: "scrape",
      status: "done",
    });
    if (status !== "missing")
      await seed.createPipelineRun({
        campaignId: campaign.campaignId,
        step: "enrich",
        status,
      });
    await open();

    await expect(stepper(page, "Website")).toContainText("Waiting");
    await expect(
      page.getByRole("button", { name: "Scrape websites", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Go to Tavily", exact: true })
      .click();

    await expect(page).toHaveURL(/step=tavily/);
    const runs = await seed.listPipelineRuns(campaign.campaignId);
    expect(runs.filter((run) => run.step === "website")).toEqual([]);
  });
}

test("enrichment without a website starts an empty website run and preserves existing emails", async ({
  page,
  seed,
  id,
}) => {
  const { campaign, open } = await openCampaign(
    page,
    seed,
    id,
    "?step=website",
  );
  const lead = await seed.createLead({
    name: `No website ${id}`,
    username: `no-website-${id}`,
    emails: [{ address: `${id}@gmail.com`, source: "manual" }],
    linkedin: `https://linkedin.com/in/${id}`,
  });
  await seed.addLeadsToCampaign({
    campaignId: campaign.campaignId,
    leadIds: [lead.leadId],
  });
  await seed.createPipelineRun({
    campaignId: campaign.campaignId,
    step: "scrape",
    status: "done",
    results: [{ leadId: lead.leadId }],
  });
  await seed.createPipelineRun({
    campaignId: campaign.campaignId,
    step: "enrich",
    status: "done",
    results: [{ leadId: lead.leadId, linkedin: lead.linkedin }],
  });
  await open();
  await page
    .getByRole("button", { name: "Scrape websites", exact: true })
    .click();

  await expect(stepper(page, "Website")).toContainText("Done");
  await expect(
    page.getByRole("button", { name: lead.name, exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(async () => {
      const runs = await seed.listPipelineRuns(campaign.campaignId);
      return runs.filter((run) => run.step === "website");
    })
    .toMatchObject([{ status: "done", total: 0, processed: 0, failed: 0 }]);
  expect(await seed.findLeadByUsername(lead.username)).toMatchObject({
    emails: [{ address: `${id}@gmail.com`, source: "manual" }],
  });
});

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

test("a campaign that never ran offers a scrape and lists no leads", async ({
  page,
  seed,
  id,
}) => {
  const { campaign, open } = await openCampaign(page, seed, id);

  await open();

  await expect(page.getByRole("button", { name: "Run scrape" })).toBeEnabled();
  await expect(stepper(page, "Scrape")).toContainText("Ready");
  await expect(page.getByText("No leads yet", { exact: true })).toBeVisible();
  expect(await seed.listPipelineRuns(campaign.campaignId)).toHaveLength(0);
});

test("a finished scrape shows its leads, the count on the stepper and offers a rerun", async ({
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

  await expect(stepper(page, "Scrape")).toContainText("3 leads");
  await expect(stepper(page, "Scrape")).toContainText("Done");
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
  await expect(stepper(page, "Scrape")).toContainText("Running");
  await expect(page.getByRole("button", { name: "Run again" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Run scrape" })).toHaveCount(0);
  expect(await seed.listPipelineRuns(campaign.campaignId)).toHaveLength(1);
});

test("a run that finishes while the page is open updates the progress, the stepper and the button on its own", async ({
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
  await expect(stepper(page, "Scrape")).toContainText("Done");
  await expect(stepper(page, "Scrape")).toContainText("4 leads");
  await expect(page.getByRole("button", { name: "Run again" })).toBeEnabled();
  const [stored] = await seed.listPipelineRuns(campaign.campaignId);
  expect(stored).toMatchObject({ status: "done", processed: 4 });
});

const progressCases: {
  name: string;
  run: {
    status: "running" | "done" | "failed";
    total?: number;
    processed?: number;
    failed?: number;
    error?: string | null;
  };
  visible: (string | RegExp)[];
  hidden: (string | RegExp)[];
}[] = [
  {
    name: "a running scrape that has not counted anything yet",
    run: { status: "running", total: 0 },
    visible: ["Searching Skool…"],
    hidden: [/of \d+ communities/],
  },
  {
    name: "large counts are formatted with separators",
    run: { status: "running", total: 12345, processed: 1234 },
    visible: ["1,234 of 12,345 communities"],
    hidden: [],
  },
  {
    name: "failures are only reported once the run has finished",
    run: { status: "running", total: 10, processed: 3, failed: 2 },
    visible: ["5 of 10 communities"],
    hidden: [/could not be processed/],
  },
  {
    name: "a finished run reports the items that could not be processed",
    run: { status: "done", total: 5, processed: 3, failed: 2 },
    visible: ["2 communities could not be processed"],
    hidden: ["The run failed"],
  },
  {
    name: "a failed run shows the reason",
    run: { status: "failed", error: "Skool blocked the search" },
    visible: ["The run failed", "Skool blocked the search"],
    hidden: [],
  },
  {
    name: "a failed run without a reason shows a generic message",
    run: { status: "failed", error: null },
    visible: ["The run failed", "Something went wrong. Try again."],
    hidden: [],
  },
];

for (const scenario of progressCases) {
  test(`scrape progress: ${scenario.name}`, async ({ page, seed, id }) => {
    const { campaign, open } = await openCampaign(page, seed, id);
    await seed.createPipelineRun({
      campaignId: campaign.campaignId,
      step: "scrape",
      ...scenario.run,
    });

    await open();

    for (const text of scenario.visible) {
      await expect(page.getByText(text)).toBeVisible();
    }
    for (const text of scenario.hidden) {
      await expect(page.getByText(text)).toHaveCount(0);
    }
    const rerun = page.getByRole("button", { name: "Run again" });
    if (scenario.run.status === "running") {
      await expect(rerun).toBeDisabled();
    } else {
      await expect(rerun).toBeEnabled();
    }
  });
}

test("the newest run is the one the page reports", async ({
  page,
  seed,
  id,
}) => {
  const { campaign, open } = await openCampaign(page, seed, id);
  await seed.createPipelineRun({
    campaignId: campaign.campaignId,
    step: "scrape",
    status: "done",
    total: 2,
    processed: 2,
  });
  await seed.createPipelineRun({
    campaignId: campaign.campaignId,
    step: "scrape",
    status: "failed",
    error: "The newer run broke",
  });

  await open();

  await expect(page.getByText("The newer run broke")).toBeVisible();
  await expect(stepper(page, "Scrape")).toContainText("Failed");
  expect(await seed.listPipelineRuns(campaign.campaignId)).toHaveLength(2);
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

test("pipeline steps fetch their own leads through the same searchable card", async ({
  page,
  seed,
  id,
}) => {
  const { campaign, open } = await openCampaign(page, seed, id);
  const enrichedAt = new Date();
  const leads: Omit<Parameters<Seed["createLead"]>[0], "username">[] = [
    {
      name: `Site ${id}`,
      website: "https://site.example.com",
      emails: [{ address: `site-${id}@acme.com`, source: "fullenrich-work" }],
      enrichedAt,
    },
    {
      name: `Linked ${id}`,
      linkedin: "https://linkedin.com/in/x",
      emails: [
        {
          address: `linked-${id}@home.com`,
          source: "fullenrich-personal",
        },
      ],
      enrichedAt,
    },
    { name: `Mail ${id}`, email: "mail@example.com", enrichedAt },
    { name: `Waiting ${id}` },
  ];
  const created = [];
  for (const [index, lead] of leads.entries()) {
    const stored = await seed.createLead({
      ...lead,
      username: `lead-${id}-${index}`,
    });
    created.push(stored);
  }
  await seed.addLeadsToCampaign({
    campaignId: campaign.campaignId,
    leadIds: created.map((lead) => lead.leadId),
  });
  await seed.createPipelineRun({
    campaignId: campaign.campaignId,
    step: "scrape",
    status: "done",
    results: created.map((lead) => ({ leadId: lead.leadId })),
  });
  await seed.createPipelineRun({
    campaignId: campaign.campaignId,
    step: "enrich",
    status: "done",
    total: 4,
    processed: 4,
    results: created
      .filter((lead) => lead.enrichedAt !== null)
      .map((lead) => ({
        leadId: lead.leadId,
        website: lead.website,
        linkedin: lead.linkedin,
      })),
  });
  await seed.createPipelineRun({
    campaignId: campaign.campaignId,
    step: "fullenrich",
    status: "done",
    results: [{ leadId: created[0]!.leadId }, { leadId: created[1]!.leadId }],
  });
  await open();
  const leadLink = (name: string) =>
    page.getByRole("button", { name: `${name} ${id}`, exact: true });
  await expect(leadLink("Waiting")).toBeVisible();
  await expect(leadLink("Mail")).toBeVisible();

  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    (url) =>
      url.pathname === "/api/leads" &&
      url.searchParams.get("pipelineStep") === "tavily",
    async (route) => {
      await gate;
      await route.continue();
    },
  );
  await stepper(page, "Tavily").click();
  await expect(page).toHaveURL(/step=tavily/);
  await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible();
  await expect(leadLink("Waiting")).toHaveCount(0);
  release();
  await expect(leadLink("Site")).toBeVisible();
  await expect(leadLink("Linked")).toBeVisible();
  await expect(leadLink("Mail")).toHaveCount(0);
  await expect(leadLink("Waiting")).toHaveCount(0);
  await expect(stepper(page, "Tavily")).toContainText("2 contactable");

  await page.locator("#lead-search").fill(`Site ${id}`);
  await expect(page).toHaveURL(/search=Site/);
  await expect(leadLink("Site")).toBeVisible();
  await expect(leadLink("Linked")).toHaveCount(0);
  await page.reload();
  await expect(leadLink("Site")).toBeVisible();
  await expect(leadLink("Linked")).toHaveCount(0);
  await page.locator("#lead-search").fill("");
  await expect(leadLink("Linked")).toBeVisible();

  await stepper(page, "FullEnrich").click();
  await expect(page).toHaveURL(/step=fullenrich/);
  await expect(stepper(page, "FullEnrich")).toContainText("2 with email");
  await expect(leadLink("Site")).toBeVisible();
  await expect(leadLink("Linked")).toBeVisible();
  await expect(leadLink("Mail")).toHaveCount(0);
  await expect(leadLink("Waiting")).toHaveCount(0);
  await expect(page.getByText(`site-${id}@acme.com`)).toBeVisible();
  await expect(page.getByText(`linked-${id}@home.com`)).toBeVisible();
  await stepper(page, "Scrape").click();
  await expect(leadLink("Waiting")).toBeVisible();
  await expect(leadLink("Mail")).toBeVisible();
});

test("a running enrichment shows the leads done so far and cannot be started again", async ({
  page,
  seed,
  id,
}) => {
  const { campaign, open } = await openCampaign(page, seed, id, "?step=tavily");
  await seed.createPipelineRun({
    campaignId: campaign.campaignId,
    step: "scrape",
    status: "done",
  });
  await seed.createPipelineRun({
    campaignId: campaign.campaignId,
    step: "enrich",
    status: "running",
    total: 4,
    processed: 1,
  });

  await open();

  await expect(page.getByText("1 of 4 leads")).toBeVisible();
  await expect(stepper(page, "Tavily")).toContainText("Running");
  await expect(
    page.getByRole("button", { name: "Run enrichment" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Run again" })).toBeDisabled();
});

test("an unknown step in the address falls back to the scrape step", async ({
  page,
  seed,
  id,
}) => {
  const { open } = await openCampaign(page, seed, id, "?step=bogus");

  await open();

  await expect(page.getByRole("button", { name: "Run scrape" })).toBeVisible();
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

test("an idle campaign page discovers a run started elsewhere and refreshes its leads", async ({
  page,
  seed,
  id,
}) => {
  const { campaign, open } = await openCampaign(page, seed, id);
  await open();
  await expect(page.getByRole("button", { name: "Run scrape" })).toBeEnabled();
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
  const lead = await seed.createLead({
    name: `External ${id}`,
    username: `external-${id}`,
  });
  await seed.addLeadsToCampaign({
    campaignId: campaign.campaignId,
    leadIds: [lead.leadId],
  });
  const run = await seed.createPipelineRun({
    campaignId: campaign.campaignId,
    step: "scrape",
    status: "running",
    total: 2,
    processed: 1,
    results: [{ leadId: lead.leadId }],
  });
  await expect(stepper(page, "Scrape")).toContainText("Running", {
    timeout: 15_000,
  });
  await expect(
    page.getByRole("button", { name: lead.name, exact: true }),
  ).toBeVisible();
  await seed.updatePipelineRun({
    runId: run.runId,
    status: "done",
    processed: 1,
    failed: 1,
  });
  await expect(stepper(page, "Scrape")).toContainText("Done", {
    timeout: 10_000,
  });
  const stored = await seed.listPipelineRuns(campaign.campaignId);
  expect(stored).toMatchObject([
    { runId: run.runId, status: "done", processed: 1, failed: 1 },
  ]);
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
  await expect(stepper(page, "Scrape")).toContainText("Failed");
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

test("a dropped event stream reconnects and catches up on what it missed", async ({
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
  let dropped = false;
  await page.route(
    (url) =>
      url.pathname.endsWith(
        `/campaigns/${campaign.campaignId}/pipeline/events`,
      ),
    async (route) => {
      if (dropped) {
        await route.continue();
        return;
      }
      dropped = true;
      await route.abort();
    },
  );

  await open();
  await expect(page.getByText("1 of 4 communities")).toBeVisible();
  await expect.poll(() => dropped).toBe(true);
  await seed.updatePipelineRun({
    runId: run.runId,
    status: "running",
    processed: 3,
  });

  await expect(page.getByText("3 of 4 communities")).toBeVisible({
    timeout: 20_000,
  });
  const [stored] = await seed.listPipelineRuns(campaign.campaignId);
  expect(stored).toMatchObject({ status: "running", processed: 3 });
});

for (const status of ["running", "failed", "missing"] satisfies Array<
  "running" | "failed" | "missing"
>) {
  test(`FullEnrich waits when the Tavily run is ${status}`, async ({
    page,
    seed,
    id,
  }) => {
    const { campaign, open } = await openCampaign(
      page,
      seed,
      id,
      "?step=fullenrich",
    );
    await seed.createPipelineRun({
      campaignId: campaign.campaignId,
      step: "scrape",
      status: "done",
    });
    if (status !== "missing") {
      await seed.createPipelineRun({
        campaignId: campaign.campaignId,
        step: "enrich",
        status,
      });
    }

    await open();

    await expect(stepper(page, "FullEnrich")).toContainText("Waiting");
    await expect(
      page.getByRole("button", { name: "Find emails", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Go to Tavily", exact: true })
      .click();
    await expect(page).toHaveURL(/step=tavily/);
    const runs = await seed.listPipelineRuns(campaign.campaignId);
    expect(runs.filter((run) => run.step === "fullenrich")).toEqual([]);
  });
}

test("an email-only Tavily result starts an empty FullEnrich run without looking up the lead", async ({
  page,
  seed,
  id,
}) => {
  const { campaign, open } = await openCampaign(
    page,
    seed,
    id,
    "?step=fullenrich",
  );
  const lead = await seed.createLead({
    name: `Email only ${id}`,
    username: `email-only-${id}`,
    email: `${id}@example.com`,
  });
  await seed.addLeadsToCampaign({
    campaignId: campaign.campaignId,
    leadIds: [lead.leadId],
  });
  await seed.createPipelineRun({
    campaignId: campaign.campaignId,
    step: "scrape",
    status: "done",
    results: [{ leadId: lead.leadId }],
  });
  await seed.createPipelineRun({
    campaignId: campaign.campaignId,
    step: "enrich",
    status: "done",
    results: [{ leadId: lead.leadId }],
  });
  await open();
  await expect(
    page.getByText("0 leads to look up", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Find emails", exact: true }).click();

  await expect(stepper(page, "FullEnrich")).toContainText("Done");
  await expect(stepper(page, "FullEnrich")).toContainText("0 with email");
  await expect(
    page.getByRole("button", { name: "Run again", exact: true }),
  ).toBeEnabled();
  await expect
    .poll(async () => {
      const runs = await seed.listPipelineRuns(campaign.campaignId);
      return runs.filter((run) => run.step === "fullenrich");
    })
    .toMatchObject([
      { status: "done", total: 0, processed: 0, failed: 0, itemsReady: true },
    ]);
  expect(await seed.findLeadByUsername(lead.username)).toMatchObject({
    emails: [{ address: `${id}@example.com`, source: "unknown" }],
    emailEnrichedAt: null,
  });
});

test("FullEnrich streams progress and a newer empty run replaces earlier email results", async ({
  page,
  seed,
  id,
}) => {
  const { campaign, open } = await openCampaign(
    page,
    seed,
    id,
    "?step=fullenrich",
  );
  const lead = await seed.createLead({
    name: `Email result ${id}`,
    username: `result-${id}`,
    emails: [{ address: `${id}@work.example.com`, source: "fullenrich-work" }],
  });
  await seed.addLeadsToCampaign({
    campaignId: campaign.campaignId,
    leadIds: [lead.leadId],
  });
  await seed.createPipelineRun({
    campaignId: campaign.campaignId,
    step: "scrape",
    status: "done",
  });
  await seed.createPipelineRun({
    campaignId: campaign.campaignId,
    step: "enrich",
    status: "done",
  });
  const run = await seed.createPipelineRun({
    campaignId: campaign.campaignId,
    step: "fullenrich",
    status: "running",
    total: 2,
    processed: 1,
    results: [{ leadId: lead.leadId }],
  });
  await open();
  await expect(page.getByText("1 of 2 leads", { exact: true })).toBeVisible();
  await expect(stepper(page, "FullEnrich")).toContainText("Running");
  await expect(
    page.getByRole("button", { name: "Loading Run again", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("link", {
      name: `${id}@work.example.com`,
      exact: true,
    }),
  ).toBeVisible();

  await seed.updatePipelineRun({
    runId: run.runId,
    status: "done",
    processed: 1,
    failed: 1,
  });

  await expect(stepper(page, "FullEnrich")).toContainText("Done");
  await expect(stepper(page, "FullEnrich")).toContainText("1 with email");
  const latest = await seed.createPipelineRun({
    campaignId: campaign.campaignId,
    step: "fullenrich",
    status: "done",
    results: [],
  });
  await expect(stepper(page, "FullEnrich")).toContainText("0 with email");
  await expect(
    page.getByRole("button", { name: lead.name, exact: true }),
  ).toHaveCount(0);
  expect(await seed.findLeadByUsername(lead.username)).toMatchObject({
    emails: [{ address: `${id}@work.example.com`, source: "fullenrich-work" }],
  });
  const runs = await seed.listPipelineRuns(campaign.campaignId);
  expect(runs.filter((stored) => stored.step === "fullenrich")).toMatchObject([
    { runId: run.runId, status: "done", processed: 1, failed: 1 },
    { runId: latest.runId, status: "done", total: 0 },
  ]);
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

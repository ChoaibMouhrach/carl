import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { initENV } from "@server/config/env";
import { campaignLeadsTable } from "@server/infrastructure/database/schemas";
import { Services } from "@server/services";
import { ScrapeWorker } from "@server/workers/scrape";
import { createContext, TestMailer } from "./helpers/context";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";
import { FakeSkoolScraper, group, owner } from "./helpers/skool";

test("a re-scrape applies the campaign limits to communities we already hold", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = new FakeSkoolScraper(
      { "private-free": [group("big-club"), group("small-club")] },
      { "big-club": owner("big"), "small-club": owner("small") },
    );
    scraper.memberCounts["big-club"] = 500;
    scraper.memberCounts["small-club"] = 5;
    const context = createContext(
      db,
      pool,
      initENV(),
      new TestMailer(),
      undefined,
      scraper,
    );
    const services = new Services({ context });

    const first = await services.scrape.run({ keywords: ["coaching"] });
    expect(first.leads).toHaveLength(2);

    const second = await services.scrape.run({
      keywords: ["coaching"],
      filters: { minMembers: 50 },
    });

    const big = await context.repositories.lead.findBySkoolUsername({
      skoolUsername: "big",
    });
    expect(second.summary).toMatchObject({
      alreadyKnown: 2,
      communitiesCreated: 0,
      filteredOut: 1,
    });
    if (!big) throw new Error("The big club's owner was not stored");
    expect(second.leads.map((lead) => lead.leadId)).toEqual([big.leadId]);
  });
});

test("campaign leads remember the keyword that found them and a replace run drops stage 1 leads it no longer finds", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = new FakeSkoolScraper(
      { "private-free": [group("alpha-club")] },
      { "alpha-club": owner("alpha"), "beta-club": owner("beta") },
    );
    const context = createContext(
      db,
      pool,
      initENV(),
      new TestMailer(),
      undefined,
      scraper,
    );
    await new ScrapeWorker({ context }).run();
    const admin = await createAuthenticatedApp({
      context,
      email: "rescrape-admin@example.com",
      role: "admin",
    });
    const campaign = await context.repositories.campaign.create({
      name: "Rescrape",
      keywords: ["alpha"],
      types: ["private"],
      pricingModels: ["free"],
      status: "active",
    });
    const scrape = (query = "") =>
      admin.app.request(
        `/api/campaigns/${campaign.campaignId}/scrape${query}`,
        {
          method: "POST",
          headers: { cookie: admin.cookie },
        },
      );
    const rowsFor = async () =>
      await db
        .select({
          leadId: campaignLeadsTable.leadId,
          stage: campaignLeadsTable.stage,
          keyword: campaignLeadsTable.keyword,
        })
        .from(campaignLeadsTable)
        .where(eq(campaignLeadsTable.campaignId, campaign.campaignId));

    expect((await scrape()).status).toBe(202);

    await context.repositories.campaign.update(
      { campaignId: campaign.campaignId },
      { keywords: ["beta"] },
    );
    scraper.pages = { "private-free": [group("beta-club")] };
    expect((await scrape()).status).toBe(202);

    const alpha = await context.repositories.lead.findBySkoolUsername({
      skoolUsername: "alpha",
    });
    const beta = await context.repositories.lead.findBySkoolUsername({
      skoolUsername: "beta",
    });
    const keywordOf = async (leadId?: number) =>
      (await rowsFor()).find((row) => row.leadId === leadId)?.keyword;
    expect(await keywordOf(alpha?.leadId)).toBe("alpha");
    expect(await keywordOf(beta?.leadId)).toBe("beta");

    const advanced = await context.repositories.lead.create({
      skoolUsername: "carol",
      name: "Carol",
    });
    await context.repositories.campaignLead.attach({
      campaignId: campaign.campaignId,
      leads: [{ leadId: advanced.leadId, keyword: "alpha" }],
      stage: 2,
      status: "pending",
    });

    expect((await scrape("?replace=true")).status).toBe(202);

    const remaining = (await rowsFor()).map((row) => row.leadId).toSorted();
    if (!beta) throw new Error("The beta owner was not stored");
    expect(remaining).toEqual([beta.leadId, advanced.leadId].toSorted());

    const [latest] = await context.repositories.scrapeRun.listByCampaignId({
      campaignId: campaign.campaignId,
      limit: 1,
    });
    expect(latest).toMatchObject({
      replace: true,
      summary: { leadsRemoved: 1 },
    });
  });
});

test("a replace run that had failures keeps every lead", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = new FakeSkoolScraper(
      { "private-free": [group("alpha-club"), group("ghost-club")] },
      { "alpha-club": owner("alpha") },
    );
    const context = createContext(
      db,
      pool,
      initENV(),
      new TestMailer(),
      undefined,
      scraper,
    );
    const campaign = await context.repositories.campaign.create({
      name: "Failing",
      keywords: ["alpha"],
      types: ["private"],
      pricingModels: ["free"],
      status: "active",
    });
    const stale = await context.repositories.lead.create({
      skoolUsername: "stale",
      name: "Stale",
    });
    await context.repositories.campaignLead.attach({
      campaignId: campaign.campaignId,
      leads: [{ leadId: stale.leadId, keyword: "old" }],
      stage: 1,
      status: "done",
    });
    const scrapeRun = await context.repositories.scrapeRun.create({
      campaignId: campaign.campaignId,
      replace: true,
    });

    await new Services({ context }).scrape.runCampaign({
      scrapeRunId: scrapeRun.scrapeRunId,
    });

    const stored = await context.repositories.scrapeRun.findByScrapeRunId({
      scrapeRunId: scrapeRun.scrapeRunId,
    });
    expect(stored?.summary?.failures).toHaveLength(1);
    expect(stored?.summary?.leadsRemoved).toBe(0);

    const rows = await db
      .select({ leadId: campaignLeadsTable.leadId })
      .from(campaignLeadsTable)
      .where(eq(campaignLeadsTable.campaignId, campaign.campaignId));
    expect(rows.map((row) => row.leadId)).toContain(stale.leadId);
  });
});

test("an invalid replace flag is refused without creating a run", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAuthenticatedApp({
      context,
      email: "replace-flag@example.com",
      role: "admin",
    });
    const campaign = await context.repositories.campaign.create({
      name: "Flag",
      keywords: ["x"],
      types: ["private"],
      pricingModels: ["free"],
      status: "active",
    });

    const response = await admin.app.request(
      `/api/campaigns/${campaign.campaignId}/scrape?replace=maybe`,
      { method: "POST", headers: { cookie: admin.cookie } },
    );
    expect(response.status).toBe(400);

    const runs = await context.repositories.scrapeRun.listByCampaignId({
      campaignId: campaign.campaignId,
      limit: 5,
    });
    expect(runs).toEqual([]);
  });
});

test("several keywords are searched together and the first one to find a community names its lead", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = new FakeSkoolScraper(
      {},
      {
        "a-club": owner("amy"),
        "shared-club": owner("sam"),
        "b-club": owner("ben"),
      },
    );
    scraper.byKeyword = {
      alpha: { "private-free": [group("a-club"), group("shared-club")] },
      beta: { "private-free": [group("shared-club"), group("b-club")] },
    };
    const context = createContext(
      db,
      pool,
      initENV(),
      new TestMailer(),
      undefined,
      scraper,
    );

    const { summary, leads } = await new Services({ context }).scrape.run({
      keywords: ["alpha", "beta"],
      searches: [{ visibility: "private", price: "free" }],
    });

    expect(summary).toMatchObject({
      keywords: ["alpha", "beta"],
      discovered: 4,
      duplicatesInRun: 1,
      communitiesCreated: 3,
      leadsCreated: 3,
      failures: [],
    });

    const names = await Promise.all(
      leads.map(async (lead) => {
        const stored = await context.repositories.lead.findByLeadId({
          leadId: lead.leadId,
        });
        return `${stored?.skoolUsername}:${lead.keyword}`;
      }),
    );
    expect(names.toSorted()).toEqual(["amy:alpha", "ben:beta", "sam:alpha"]);
    expect(scraper.aboutCalls.toSorted()).toEqual([
      "a-club",
      "b-club",
      "shared-club",
    ]);
  });
});

test("campaign keywords are trimmed, deduplicated and limited", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAuthenticatedApp({
      context,
      email: "keywords-admin@example.com",
      role: "admin",
    });
    const create = (body: object) =>
      admin.app.request("/api/campaigns", {
        method: "POST",
        headers: {
          cookie: admin.cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    const countCampaigns = async () =>
      (await context.repositories.campaign.list({ page: 1 })).campaigns.length;

    const created = await create({
      name: "Many",
      keywords: ["Coaching ", " coaching", "Fitness"],
    });
    expect(created.status).toBe(201);
    const stored = await context.repositories.campaign.list({ page: 1 });
    expect(stored.campaigns.map((campaign) => campaign.keywords)).toEqual([
      ["Coaching", "Fitness"],
    ]);

    const rejected = [
      { name: "None", keywords: [] },
      { name: "Blank", keywords: ["  "] },
      { name: "Legacy", keyword: "coaching" },
      {
        name: "Too many",
        keywords: Array.from({ length: 11 }, (_, index) => `keyword ${index}`),
      },
    ];

    for (const body of rejected) {
      expect((await create(body)).status).toBe(400);
    }
    // Validation refuses each request before the service runs, so only the first campaign exists
    expect(await countCampaigns()).toBe(1);
  });
});

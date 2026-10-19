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

    const first = await services.scrape.run({ keyword: "coaching" });
    expect(first.leadIds).toHaveLength(2);

    const second = await services.scrape.run({
      keyword: "coaching",
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
    expect(second.leadIds).toEqual([big?.leadId]);
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
      keyword: "alpha",
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
      { keyword: "beta" },
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
      leadIds: [advanced.leadId],
      stage: 2,
      status: "pending",
      keyword: "alpha",
    });

    expect((await scrape("?replace=true")).status).toBe(202);

    const remaining = (await rowsFor()).map((row) => row.leadId).toSorted();
    expect(remaining).toEqual([beta?.leadId, advanced.leadId].toSorted());

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
      keyword: "alpha",
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
      leadIds: [stale.leadId],
      stage: 1,
      status: "done",
      keyword: "old",
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
      keyword: "x",
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

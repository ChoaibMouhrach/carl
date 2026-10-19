import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { initENV } from "@server/config/env";
import type { DB } from "@server/infrastructure/database/client";
import {
  campaignLeadsTable,
  leadsTable,
  scrapeRunsTable,
} from "@server/infrastructure/database/schemas";
import { Services } from "@server/services";
import { ScrapeWorker } from "@server/workers/scrape";
import type { Pool } from "pg";
import { createAdminClient, seedLead } from "./helpers/api";
import { createContext, TestMailer } from "./helpers/context";
import { withTestDatabase } from "./helpers/http";
import { FakeSkoolScraper, group, owner } from "./helpers/skool";

const boot = async (db: DB, pool: Pool, scraper: FakeSkoolScraper) => {
  const context = createContext(
    db,
    pool,
    initENV(),
    new TestMailer(),
    undefined,
    scraper,
  );
  const admin = await createAdminClient(context, "lifecycle@example.com");

  return { context, admin, services: new Services({ context }) };
};

const createCampaign = async (
  context: Awaited<ReturnType<typeof boot>>["context"],
  overrides: Partial<{
    name: string;
    keywords: string[];
    status: "draft" | "active" | "paused" | "completed";
  }> = {},
) =>
  await context.repositories.campaign.create({
    name: "Lifecycle",
    keywords: ["alpha"],
    types: ["private"],
    pricingModels: ["free"],
    status: "active",
    ...overrides,
  });

const clubScraper = () =>
  new FakeSkoolScraper(
    { "private-free": [group("one-club"), group("two-club")] },
    { "one-club": owner("one"), "two-club": owner("two") },
  );

test("only an active campaign can be scraped and a refused start creates no run and no job", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool, clubScraper());

    for (const status of ["draft", "paused", "completed"] as const) {
      const campaign = await createCampaign(context, { status });
      const response = await admin.post(
        `/api/campaigns/${campaign.campaignId}/scrape`,
      );
      expect([status, response.status]).toEqual([status, 400]);
    }

    expect(await db.$count(scrapeRunsTable)).toBe(0);
    expect((await context.queueHub.scrape.getCounts()).completed).toBe(0);
    expect(context.eventBus.published).toEqual([]);
  });
});

test("scraping a campaign that does not exist is refused and creates nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool, clubScraper());

    expect((await admin.post("/api/campaigns/999999/scrape")).status).toBe(404);
    expect((await admin.post("/api/campaigns/0/scrape")).status).toBe(400);

    expect(await db.$count(scrapeRunsTable)).toBe(0);
    expect((await context.queueHub.scrape.getCounts()).completed).toBe(0);
  });
});

test("starting a scrape queues exactly one run, announces it and refuses a second while it waits", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool, clubScraper());
    const campaign = await createCampaign(context);
    const path = `/api/campaigns/${campaign.campaignId}/scrape`;

    const started = await admin.post(path);
    expect(started.status).toBe(202);

    const runs = await db.select().from(scrapeRunsTable);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      campaignId: campaign.campaignId,
      status: "queued",
      replace: false,
      startedAt: null,
      finishedAt: null,
      summary: null,
      error: null,
    });
    expect((await context.queueHub.scrape.getCounts()).completed).toBe(1);
    expect(context.eventBus.published).toEqual(["campaigns.changed"]);

    const second = await admin.post(path);
    expect(second.status).toBe(409);
    expect(await db.$count(scrapeRunsTable)).toBe(1);
  });
});

test("a running scrape blocks a new one for its campaign only, and a finished one does not", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool, clubScraper());
    const busy = await createCampaign(context, { name: "Busy" });
    const idle = await createCampaign(context, { name: "Idle" });
    const run = await context.repositories.scrapeRun.create({
      campaignId: busy.campaignId,
    });
    await context.repositories.scrapeRun.update(
      { scrapeRunId: run.scrapeRunId },
      { status: "running" },
    );

    expect(
      (await admin.post(`/api/campaigns/${busy.campaignId}/scrape`)).status,
    ).toBe(409);
    expect(
      (await admin.post(`/api/campaigns/${idle.campaignId}/scrape`)).status,
    ).toBe(202);
    expect(await db.$count(scrapeRunsTable)).toBe(2);

    for (const status of ["completed", "failed"] as const) {
      await context.repositories.scrapeRun.update(
        { scrapeRunId: run.scrapeRunId },
        { status },
      );
      const response = await admin.post(
        `/api/campaigns/${busy.campaignId}/scrape`,
      );
      expect([status, response.status]).toEqual([status, 202]);
      // Mark the new run finished too so the next loop starts from a clean slate
      const latest =
        await context.repositories.scrapeRun.findActiveByCampaignId({
          campaignId: busy.campaignId,
        });
      if (latest) {
        await context.repositories.scrapeRun.update(
          { scrapeRunId: latest.scrapeRunId },
          { status: "completed" },
        );
      }
    }
  });
});

test("a finished run records its timing, its summary and the leads it attached with their keyword", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool, clubScraper());
    await new ScrapeWorker({ context }).run();
    const campaign = await createCampaign(context);

    const response = await admin.post(
      `/api/campaigns/${campaign.campaignId}/scrape`,
    );
    expect(response.status).toBe(202);

    const [run] = await db.select().from(scrapeRunsTable);
    expect(run).toMatchObject({
      status: "completed",
      error: null,
      summary: {
        keywords: ["alpha"],
        discovered: 2,
        communitiesCreated: 2,
        leadsCreated: 2,
        leadsAttached: 2,
        leadsRemoved: 0,
        filteredOut: 0,
        failures: [],
      },
    });
    expect(run?.startedAt).not.toBeNull();
    expect(run?.finishedAt).not.toBeNull();
    expect(run!.finishedAt!.getTime()).toBeGreaterThanOrEqual(
      run!.startedAt!.getTime(),
    );

    const links = await db.select().from(campaignLeadsTable);
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toMatchObject({
        campaignId: campaign.campaignId,
        stage: 1,
        status: "done",
        keyword: "alpha",
      });
    }
    expect(context.eventBus.published).toContain("leads.changed");
    expect(context.eventBus.published).toContain("communities.changed");
  });
});

test("a failed run records why, attaches nothing and does not block the next attempt", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = clubScraper();
    scraper.discoverError = new Error("Skool is unreachable");
    const { context, admin } = await boot(db, pool, scraper);
    await new ScrapeWorker({ context }).run();
    const campaign = await createCampaign(context);
    const path = `/api/campaigns/${campaign.campaignId}/scrape`;

    // The in-memory queue runs the job inline, so its failure surfaces on the request
    await Promise.resolve(admin.post(path)).catch(() => undefined);

    const [failed] = await db.select().from(scrapeRunsTable);
    expect(failed).toMatchObject({
      status: "failed",
      error: "Skool is unreachable",
    });
    expect(failed?.finishedAt).not.toBeNull();
    expect(await db.$count(campaignLeadsTable)).toBe(0);

    scraper.discoverError = null;
    const retry = await admin.post(path);
    expect(retry.status).toBe(202);

    const runs = await db.select().from(scrapeRunsTable);
    expect(runs.map((run) => run.status).toSorted()).toEqual([
      "completed",
      "failed",
    ]);
    expect(await db.$count(campaignLeadsTable)).toBe(2);
  });
});

test("a run that does not exist is ignored", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = clubScraper();
    const { services } = await boot(db, pool, scraper);

    await services.scrape.runCampaign({ scrapeRunId: 999999 });

    expect(scraper.discoverCalls).toEqual([]);
    expect(await db.$count(scrapeRunsTable)).toBe(0);
    expect(await db.$count(leadsTable)).toBe(0);
  });
});

test("the same job delivered twice scrapes once", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = clubScraper();
    const { context, admin } = await boot(db, pool, scraper);
    await new ScrapeWorker({ context }).run();
    const campaign = await createCampaign(context);

    await admin.post(`/api/campaigns/${campaign.campaignId}/scrape`);
    const [run] = await db.select().from(scrapeRunsTable);
    const callsAfterFirst = scraper.discoverCalls.length;

    await context.queueHub.scrape.add(
      { scrapeRunId: run!.scrapeRunId },
      { idempotencyKey: `scrape-run-${run!.scrapeRunId}` },
    );

    expect(scraper.discoverCalls).toHaveLength(callsAfterFirst);
    expect(await db.$count(scrapeRunsTable)).toBe(1);
  });
});

test("a run uses the campaign's settings as they are when it starts, not when it was queued", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = new FakeSkoolScraper({}, { "new-club": owner("nina") });
    scraper.byKeyword = {
      oldword: { "private-free": [] },
      newword: { "private-free": [group("new-club")] },
    };
    const { context, admin, services } = await boot(db, pool, scraper);
    const campaign = await createCampaign(context, { keywords: ["oldword"] });

    await admin.post(`/api/campaigns/${campaign.campaignId}/scrape`);
    await context.repositories.campaign.update(
      { campaignId: campaign.campaignId },
      { keywords: ["newword"] },
    );
    const [run] = await db.select().from(scrapeRunsTable);
    await services.scrape.runCampaign({ scrapeRunId: run!.scrapeRunId });

    expect(
      scraper.discoverCalls.every((call) => call.startsWith("newword/")),
    ).toBe(true);
    const links = await db.select().from(campaignLeadsTable);
    expect(links.map((link) => link.keyword)).toEqual(["newword"]);
  });
});

test("a replace run keeps the leads it finds again once and drops the stage 1 leads it does not", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, services } = await boot(db, pool, clubScraper());
    const campaign = await createCampaign(context);
    const found = await seedLead(context, { skoolUsername: "one" });
    const gone = await seedLead(context, { skoolUsername: "gone" });
    await context.repositories.campaignLead.attach({
      campaignId: campaign.campaignId,
      leads: [
        { leadId: found.leadId, keyword: "old" },
        { leadId: gone.leadId, keyword: "old" },
      ],
      stage: 1,
      status: "done",
    });
    const run = await context.repositories.scrapeRun.create({
      campaignId: campaign.campaignId,
      replace: true,
    });

    await services.scrape.runCampaign({ scrapeRunId: run.scrapeRunId });

    const links = await db
      .select()
      .from(campaignLeadsTable)
      .where(eq(campaignLeadsTable.campaignId, campaign.campaignId));
    const remaining = links.map((link) => link.leadId).toSorted();
    const twoLead = await context.repositories.lead.findBySkoolUsername({
      skoolUsername: "two",
    });
    expect(remaining).toEqual([found.leadId, twoLead!.leadId].toSorted());
    // The lead found again keeps the keyword it already had
    expect(links.find((link) => link.leadId === found.leadId)?.keyword).toBe(
      "old",
    );
    const [stored] = await db
      .select()
      .from(scrapeRunsTable)
      .where(eq(scrapeRunsTable.scrapeRunId, run.scrapeRunId));
    expect(stored?.summary).toMatchObject({
      leadsAttached: 1,
      leadsRemoved: 1,
    });
  });
});

test("a replace run on a campaign with no leads simply adds what it finds", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, services } = await boot(db, pool, clubScraper());
    const campaign = await createCampaign(context);
    const run = await context.repositories.scrapeRun.create({
      campaignId: campaign.campaignId,
      replace: true,
    });

    await services.scrape.runCampaign({ scrapeRunId: run.scrapeRunId });

    expect(await db.$count(campaignLeadsTable)).toBe(2);
    const [stored] = await db.select().from(scrapeRunsTable);
    expect(stored?.summary).toMatchObject({
      leadsAttached: 2,
      leadsRemoved: 0,
    });
  });
});

test("a replace run removes every unfound stage 1 lead even across the insert chunk size", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, services } = await boot(db, pool, clubScraper());
    const campaign = await createCampaign(context);
    const inserted = await db
      .insert(leadsTable)
      .values(
        Array.from({ length: 1001 }, (_, index) => ({
          skoolUsername: `stale-${index}`,
          name: `Stale ${index}`,
        })),
      )
      .returning({ leadId: leadsTable.leadId });
    await context.repositories.campaignLead.attach({
      campaignId: campaign.campaignId,
      leads: inserted.map((row) => ({ leadId: row.leadId, keyword: "old" })),
      stage: 1,
      status: "done",
    });
    const run = await context.repositories.scrapeRun.create({
      campaignId: campaign.campaignId,
      replace: true,
    });

    await services.scrape.runCampaign({ scrapeRunId: run.scrapeRunId });

    const links = await db.select().from(campaignLeadsTable);
    expect(links).toHaveLength(2);
    const [stored] = await db.select().from(scrapeRunsTable);
    expect(stored?.summary).toMatchObject({
      leadsRemoved: 1001,
      leadsAttached: 2,
    });
    // The leads themselves are never deleted, only their place in the campaign
    expect(await db.$count(leadsTable)).toBe(1003);
  });
});

test("a replace run that finds nothing removes nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, services } = await boot(
      db,
      pool,
      new FakeSkoolScraper({}, {}),
    );
    const campaign = await createCampaign(context);
    const lead = await seedLead(context);
    await context.repositories.campaignLead.attach({
      campaignId: campaign.campaignId,
      leads: [{ leadId: lead.leadId, keyword: "old" }],
      stage: 1,
      status: "done",
    });
    const run = await context.repositories.scrapeRun.create({
      campaignId: campaign.campaignId,
      replace: true,
    });

    await services.scrape.runCampaign({ scrapeRunId: run.scrapeRunId });

    const links = await db.select().from(campaignLeadsTable);
    expect(links.map((link) => link.leadId)).toEqual([lead.leadId]);
    const [stored] = await db.select().from(scrapeRunsTable);
    expect(stored).toMatchObject({
      status: "completed",
      summary: { leadsAttached: 0, leadsRemoved: 0 },
    });
  });
});

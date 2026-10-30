import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import z from "zod";
import { initENV } from "@server/config/env";
import type { DB } from "@server/infrastructure/database/client";
import {
  campaignCommunitiesTable,
  campaignLeadsTable,
  campaignsTable,
  communitiesTable,
  leadsTable,
  pipelineItemsTable,
} from "@server/infrastructure/database/schemas";
import { ScrapeService } from "@server/services/scrape";
import { ScrapeWorker } from "@server/workers/scrape";
import { createAdminClient } from "./helpers/api";
import { createContext } from "./helpers/context";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";
import {
  FakeWebSearch,
  ManualQueue,
  insertCampaign,
  insertRun,
  runRows,
} from "./helpers/pipeline";
import { FakeSkoolScrapper, freeCommunity, paidMonthly } from "./helpers/skool";

type Pool = Parameters<typeof createContext>[1];

const runSchema = z.object({
  runId: z.number(),
  campaignId: z.number(),
  step: z.enum(["scrape", "enrich"]),
  status: z.enum(["running", "done", "failed"]),
  total: z.number(),
  processed: z.number(),
  failed: z.number(),
  error: z.string().nullable(),
});

const errorSchema = z.object({ code: z.string() });

const boot = async (
  db: DB,
  pool: Pool,
  options: { scrapper?: FakeSkoolScrapper; webSearch?: FakeWebSearch } = {},
) => {
  const context = createContext(db, pool, initENV());

  if (options.scrapper) {
    context.skoolScrapper = options.scrapper;
    await new ScrapeWorker({ context }).run();
  }

  if (options.webSearch) {
    context.webSearch = options.webSearch;
  }

  const admin = await createAdminClient(context, "pipeline-api@example.com");

  return { context, admin };
};

const scrapePath = (campaignId: number) =>
  `/api/campaigns/${campaignId}/pipeline/scrape`;
const enrichPath = (campaignId: number) =>
  `/api/campaigns/${campaignId}/pipeline/enrich`;
const statusPath = (campaignId: number) =>
  `/api/campaigns/${campaignId}/pipeline`;

const SKOOL = "https://www.skool.com";

test("every pipeline route refuses anonymous and non-admin callers and starts nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context } = await boot(db, pool, {
      webSearch: new FakeWebSearch(),
    });
    const campaign = await insertCampaign(db);
    const member = await createAuthenticatedApp({
      context,
      email: "pipeline-member@example.com",
    });
    const calls = [
      ["GET", statusPath(campaign.campaignId)],
      ["POST", scrapePath(campaign.campaignId)],
      ["POST", enrichPath(campaign.campaignId)],
    ];

    for (const [method, path] of calls) {
      const anonymous = await member.app.request(path, { method });
      expect(anonymous.status).toBe(401);

      const refused = await member.app.request(path, {
        method,
        headers: { cookie: member.cookie },
      });
      expect(refused.status).toBe(403);
    }

    expect(await runRows(db)).toHaveLength(0);
    expect(context.queueHub.scrape.added).toHaveLength(0);
    expect(context.queueHub.enrich.added).toHaveLength(0);
  });
});

test("an unknown campaign is a 404 and an invalid id is a 400, and no run or job is created", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool, {
      webSearch: new FakeWebSearch(),
    });
    const missing = 987654;

    const responses = [
      await admin.get(statusPath(missing)),
      await admin.post(scrapePath(missing)),
      await admin.post(enrichPath(missing), {}),
    ];

    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(errorSchema.parse(await response.json()).code).toBe(
        "campaignNotFound",
      );
    }

    for (const id of [0, -1]) {
      for (const path of [scrapePath(id), enrichPath(id)]) {
        expect((await admin.post(path, {})).status).toBe(400);
      }
    }
    expect(
      (await admin.post("/api/campaigns/abc/pipeline/scrape")).status,
    ).toBe(400);

    expect(await runRows(db)).toHaveLength(0);
    expect(context.queueHub.scrape.added).toHaveLength(0);
    expect(context.queueHub.enrich.added).toHaveLength(0);
  });
});

test("starting a scrape stores a running run and queues one discover job built from the campaign", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool);
    const campaign = await insertCampaign(db, {
      keyword: "fitness coaching",
      minPriceCents: 4900,
      minMembers: 100,
    });

    const response = await admin.post(scrapePath(campaign.campaignId));

    expect(response.status).toBe(202);
    const returned = runSchema.parse(await response.json());
    const rows = await runRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      runId: returned.runId,
      campaignId: campaign.campaignId,
      step: "scrape",
      status: "running",
      total: 0,
      processed: 0,
      failed: 0,
      error: null,
    });
    expect(context.queueHub.scrape.added).toEqual([
      {
        type: "discover",
        search: "fitness coaching",
        minPrice: 49,
        minMembers: 100,
        runId: returned.runId,
        campaignId: campaign.campaignId,
      },
    ]);
  });
});

test("a campaign without price and member limits queues a discover job without filters, and a zero price limit stays a filter", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool);
    const unfiltered = await insertCampaign(db, { name: "Open" });
    const zeroPrice = await insertCampaign(db, {
      name: "Zero",
      minPriceCents: 0,
      minMembers: 0,
    });

    await admin.post(scrapePath(unfiltered.campaignId));
    await admin.post(scrapePath(zeroPrice.campaignId));

    const [first, second] = context.queueHub.scrape.added;
    expect(first).toEqual({
      type: "discover",
      search: "fitness",
      campaignId: unfiltered.campaignId,
      runId: expect.any(Number),
    });
    expect(second).toMatchObject({
      campaignId: zeroPrice.campaignId,
      minPrice: 0,
      minMembers: 0,
    });
  });
});

test("an inactive campaign cannot start a scrape and nothing is stored or queued", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool);
    const campaign = await insertCampaign(db, { isActive: false });

    const response = await admin.post(scrapePath(campaign.campaignId));

    expect(response.status).toBe(400);
    expect(errorSchema.parse(await response.json()).code).toBe(
      "campaignInactive",
    );
    expect(await runRows(db)).toHaveLength(0);
    expect(context.queueHub.scrape.added).toHaveLength(0);
  });
});

test("a second start of a running step is a 409 that keeps the single run and queues nothing more", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool, {
      webSearch: new FakeWebSearch(),
    });
    const campaign = await insertCampaign(db);
    await insertRun(db, {
      campaignId: campaign.campaignId,
      step: "scrape",
      status: "done",
      total: 1,
      processed: 1,
    });

    expect((await admin.post(scrapePath(campaign.campaignId))).status).toBe(
      202,
    );
    const again = await admin.post(scrapePath(campaign.campaignId));

    expect(again.status).toBe(409);
    expect(errorSchema.parse(await again.json()).code).toBe(
      "pipelineRunInProgress",
    );
    const running = (await runRows(db)).filter(
      (run) => run.step === "scrape" && run.status === "running",
    );
    expect(running).toHaveLength(1);
    expect(context.queueHub.scrape.added).toHaveLength(1);
  });
});

test("two simultaneous starts produce exactly one running run and one 409", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool);
    const campaign = await insertCampaign(db);

    const responses = await Promise.all([
      admin.post(scrapePath(campaign.campaignId)),
      admin.post(scrapePath(campaign.campaignId)),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      202, 409,
    ]);
    expect(await runRows(db)).toHaveLength(1);
    expect(context.queueHub.scrape.added).toHaveLength(1);
  });
});

test("a scrape stores new communities and leads, links the stored ones, and finishes the run", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scrapper = new FakeSkoolScrapper({
      pages: {
        1: [
          paidMonthly("alpha", 50),
          paidMonthly("beta", 60),
          paidMonthly("gamma", 70),
          paidMonthly("tiny", 2),
          freeCommunity("freebie"),
        ],
      },
      owners: {
        [`${SKOOL}/alpha`]: "ann",
        [`${SKOOL}/beta`]: "bob",
        [`${SKOOL}/gamma`]: "ann",
        [`${SKOOL}/tiny`]: "tim",
        [`${SKOOL}/freebie`]: "fay",
      },
    });
    const { context, admin } = await boot(db, pool, { scrapper });
    const campaign = await insertCampaign(db, {
      minPriceCents: 2700,
      minMembers: 10,
    });
    const ann = await context.repositories.lead.create({
      name: "Stored Ann",
      username: "ann",
      skoolUrl: `${SKOOL}/@ann`,
    });
    await context.repositories.community.create({
      leadId: ann.leadId,
      name: "Stored alpha",
      skoolUrl: `${SKOOL}/alpha`,
      isFree: false,
    });

    const response = await admin.post(scrapePath(campaign.campaignId));

    expect(response.status).toBe(202);
    expect(scrapper.aboutCalls.sort()).toEqual([
      `${SKOOL}/beta`,
      `${SKOOL}/gamma`,
    ]);
    const leads = await db.select().from(leadsTable);
    expect(leads.map((lead) => lead.username).sort()).toEqual(["ann", "bob"]);
    const communities = await db.select().from(communitiesTable);
    expect(communities.map((community) => community.skoolUrl).sort()).toEqual([
      `${SKOOL}/alpha`,
      `${SKOOL}/beta`,
      `${SKOOL}/gamma`,
    ]);
    const linkedLeads = await db
      .select()
      .from(campaignLeadsTable)
      .where(eq(campaignLeadsTable.campaignId, campaign.campaignId));
    expect(linkedLeads.map((link) => link.leadId).sort()).toEqual(
      leads.map((lead) => lead.leadId).sort(),
    );
    const linkedCommunities = await db
      .select()
      .from(campaignCommunitiesTable)
      .where(eq(campaignCommunitiesTable.campaignId, campaign.campaignId));
    expect(linkedCommunities.map((link) => link.communityId).sort()).toEqual(
      communities.map((community) => community.communityId).sort(),
    );
    expect(await runRows(db)).toMatchObject([
      { step: "scrape", status: "done", total: 3, processed: 3, failed: 0 },
    ]);
    const runs = await runRows(db);
    const run = runs[0];
    if (!run) throw new Error("Missing scrape run");
    const items = await db
      .select()
      .from(pipelineItemsTable)
      .where(eq(pipelineItemsTable.runId, run.runId));
    expect(items).toHaveLength(3);
    expect(items.every((item) => item.status === "processed")).toBe(true);
    await new ScrapeService({ context }).discover({
      runId: run.runId,
      campaignId: campaign.campaignId,
      search: campaign.keyword,
    });
    expect(await runRows(db)).toEqual(runs);
    expect(scrapper.discoverCalls).toHaveLength(1);
  });
});

test("a scrape whose hits are all filtered out or already stored finishes at once without queueing item jobs", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scrapper = new FakeSkoolScrapper({
      pages: { 1: [paidMonthly("alpha", 50), paidMonthly("tiny", 1)] },
      owners: { [`${SKOOL}/alpha`]: "ann", [`${SKOOL}/tiny`]: "tim" },
    });
    const { context, admin } = await boot(db, pool, { scrapper });
    const campaign = await insertCampaign(db, { minMembers: 10 });
    const ann = await context.repositories.lead.create({
      name: "Ann",
      username: "ann",
      skoolUrl: `${SKOOL}/@ann`,
    });
    await context.repositories.community.create({
      leadId: ann.leadId,
      name: "Alpha",
      skoolUrl: `${SKOOL}/alpha`,
      isFree: false,
    });

    expect((await admin.post(scrapePath(campaign.campaignId))).status).toBe(
      202,
    );

    expect(await runRows(db)).toMatchObject([
      { status: "done", total: 1, processed: 1, failed: 0 },
    ]);
    expect(context.queueHub.scrape.added.map((job) => job.type)).toEqual([
      "discover",
    ]);
    expect(await db.select().from(leadsTable)).toHaveLength(1);
    const linkedLeads = await db.select().from(campaignLeadsTable);
    expect(linkedLeads).toEqual([
      { campaignId: campaign.campaignId, leadId: ann.leadId },
    ]);
  });
});

test("a discover with no hits at all finishes the run with nothing stored", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scrapper = new FakeSkoolScrapper({ pages: { 1: [] }, owners: {} });
    const { admin } = await boot(db, pool, { scrapper });
    const campaign = await insertCampaign(db);

    await admin.post(scrapePath(campaign.campaignId));

    expect(await runRows(db)).toMatchObject([
      { status: "done", total: 0, processed: 0, failed: 0 },
    ]);
    expect(await db.select().from(leadsTable)).toHaveLength(0);
    expect(await db.select().from(campaignLeadsTable)).toHaveLength(0);
  });
});

test("a community or lead Skool no longer has is skipped, counted as processed, and stores nothing", async () => {
  const scenarios = [
    { name: "community", missingCommunities: [`${SKOOL}/alpha`] },
    { name: "lead", missingLeads: [`${SKOOL}/@ann`] },
  ];

  for (const scenario of scenarios) {
    await withTestDatabase(async ({ db, pool }) => {
      const scrapper = new FakeSkoolScrapper({
        pages: { 1: [paidMonthly("alpha", 50)] },
        owners: { [`${SKOOL}/alpha`]: "ann" },
        missingCommunities: scenario.missingCommunities,
        missingLeads: scenario.missingLeads,
      });
      const { admin } = await boot(db, pool, { scrapper });
      const campaign = await insertCampaign(db);

      await admin.post(scrapePath(campaign.campaignId));

      expect(await runRows(db)).toMatchObject([
        { status: "done", total: 1, processed: 1, failed: 0 },
      ]);
      expect(await db.select().from(leadsTable)).toHaveLength(0);
      expect(await db.select().from(communitiesTable)).toHaveLength(0);
      expect(await db.select().from(campaignLeadsTable)).toHaveLength(0);
    });
  }
});

test("a queue that refuses the scrape job fails the run with the reason and lets the next start through", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool);
    const queue = new ManualQueue<
      Parameters<typeof context.queueHub.scrape.add>[0]
    >();
    context.queueHub.scrape = queue;
    const campaign = await insertCampaign(db);
    queue.failAddWith = new Error("redis is down");

    const failed = await admin.post(scrapePath(campaign.campaignId));

    expect(failed.status).toBe(500);
    expect(await runRows(db)).toMatchObject([
      { step: "scrape", status: "failed", error: "redis is down" },
    ]);

    queue.failAddWith = undefined;
    const retried = await admin.post(scrapePath(campaign.campaignId));

    expect(retried.status).toBe(202);
    const rows = await runRows(db);
    expect(rows.map((run) => run.status).sort()).toEqual(["failed", "running"]);
  });
});

test("deleting a campaign removes its pipeline runs and leaves other campaigns' runs", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin } = await boot(db, pool);
    const doomed = await insertCampaign(db, { name: "Doomed" });
    const kept = await insertCampaign(db, { name: "Kept" });
    await insertRun(db, { campaignId: doomed.campaignId, step: "scrape" });
    await insertRun(db, {
      campaignId: doomed.campaignId,
      step: "enrich",
      status: "done",
    });
    await insertRun(db, { campaignId: kept.campaignId, step: "scrape" });

    const response = await admin.delete(`/api/campaigns/${doomed.campaignId}`);

    expect(response.status).toBe(204);
    expect(await db.select().from(campaignsTable)).toHaveLength(1);
    expect(await runRows(db)).toMatchObject([
      { campaignId: kept.campaignId, step: "scrape" },
    ]);
  });
});

test("a permanently failed scrape job is accounted on its run by job type", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context } = await boot(db, pool);
    const campaign = await insertCampaign(db);
    const scrape = new ScrapeService({ context });
    const community = paidMonthly("alpha");
    const itemRun = await insertRun(db, {
      campaignId: campaign.campaignId,
      step: "scrape",
      total: 3,
    });

    await scrape.recordFailure(
      {
        type: "scrape-community",
        communityURL: community.communityURL,
        runId: itemRun.runId,
        campaignId: campaign.campaignId,
      },
      new Error("blocked"),
    );
    await scrape.recordFailure(
      {
        type: "scrape-lead",
        leadURL: `${SKOOL}/@ann`,
        community,
        runId: itemRun.runId,
        campaignId: campaign.campaignId,
      },
      new Error("blocked"),
    );

    expect(await runRows(db)).toMatchObject([
      { status: "running", processed: 0, failed: 1, error: null },
    ]);

    await scrape.recordFailure(
      {
        type: "discover",
        search: "fitness",
        runId: itemRun.runId,
        campaignId: campaign.campaignId,
      },
      new Error("search page changed"),
    );

    expect(await runRows(db)).toMatchObject([
      { status: "failed", failed: 1, error: "search page changed" },
    ]);
  });
});

test("a failed scrape job that is not part of a run changes no run", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context } = await boot(db, pool);
    const campaign = await insertCampaign(db);
    await insertRun(db, {
      campaignId: campaign.campaignId,
      step: "scrape",
      total: 2,
    });
    const before = await runRows(db);

    await new ScrapeService({ context }).recordFailure(
      { type: "discover", search: "fitness" },
      new Error("boom"),
    );

    expect(await runRows(db)).toEqual(before);
  });
});

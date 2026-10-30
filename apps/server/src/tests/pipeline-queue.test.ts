import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { eq, inArray } from "drizzle-orm";
import z from "zod";
import { initENV } from "@server/config/env";
import type { Context } from "@server/context";
import type { DB } from "@server/infrastructure/database/client";
import { BullQueue, ScrapeQueue } from "@server/infrastructure/queue/bullmq";
import {
  campaignsTable,
  campaignLeadsTable,
  communitiesTable,
  leadsTable,
  pipelineItemsTable,
  pipelineRunsTable,
  type PipelineRun,
} from "@server/infrastructure/database/schemas";
import {
  BaseQueueHub,
  type EnrichJob,
  type WebsiteJob,
  type RegisteredQueue,
} from "@server/lib/base-queue";
import { WebSearchError } from "@server/lib/base-web-search";
import { ScrapeWorker } from "@server/workers/scrape";
import { EnrichWorker } from "@server/workers/enrich";
import { WebsiteWorker } from "@server/workers/website";
import { BaseWebPageFetcher } from "@server/lib/base-web-page-fetcher";
import { createAdminClient } from "./helpers/api";
import { createContext } from "./helpers/context";
import { withTestDatabase } from "./helpers/http";
import {
  FakeWebSearch,
  insertCampaign,
  leadEmailRows,
} from "./helpers/pipeline";
import { FakeSkoolScrapper, paidMonthly } from "./helpers/skool";

class RedisPipelineHub extends BaseQueueHub {
  public email;
  public maintenance;
  public scrape;
  public enrich;
  public website;
  private readonly names;
  private readonly redisUrl;

  public constructor(context: Context) {
    super();
    const suffix = randomUUID();
    const scrapeName = `test-pipeline-scrape-${suffix}`;
    const enrichName = `test-pipeline-enrich-${suffix}`;
    const websiteName = `test-pipeline-website-${suffix}`;
    this.names = [scrapeName, enrichName, websiteName];
    this.redisUrl = context.env.REDIS_CONNECTION_STRING;
    this.email = context.queueHub.email;
    this.maintenance = context.queueHub.maintenance;
    this.scrape = new ScrapeQueue({
      name: scrapeName,
      concurrency: 2,
      redisUrl: this.redisUrl,
      errorMonitor: context.errorMonitor,
      logger: context.logger,
    });
    this.enrich = new BullQueue<EnrichJob>({
      name: enrichName,
      jobName: "run",
      concurrency: 2,
      redisUrl: this.redisUrl,
      errorMonitor: context.errorMonitor,
      logger: context.logger,
    });
    this.website = new BullQueue<WebsiteJob>({
      name: websiteName,
      jobName: "run",
      concurrency: 2,
      redisUrl: this.redisUrl,
      errorMonitor: context.errorMonitor,
      logger: context.logger,
    });
  }

  public override queues(): RegisteredQueue[] {
    return [
      { name: "scrape", queue: this.scrape },
      { name: "enrich", queue: this.enrich },
      { name: "website", queue: this.website },
    ];
  }

  public override async close(): Promise<void> {
    await Promise.all([
      this.scrape.close(),
      this.enrich.close(),
      this.website.close(),
    ]);
    const connection = new IORedis(this.redisUrl, {
      maxRetriesPerRequest: null,
    });
    try {
      for (const name of this.names) {
        const queue = new Queue(name, { connection });
        try {
          await queue.obliterate({ force: true });
        } finally {
          await queue.close();
        }
      }
    } finally {
      await connection.quit();
    }
  }
}

const runIdSchema = z.object({ runId: z.number() });
type Admin = Awaited<ReturnType<typeof createAdminClient>>;

const start = async (
  admin: Admin,
  campaignId: number,
  step: "scrape" | "enrich" | "website",
) => {
  const response = await admin.post(
    `/api/campaigns/${campaignId}/pipeline/${step}`,
  );
  expect(response.status).toBe(202);
  const body: unknown = await response.json();
  return runIdSchema.parse(body).runId;
};

const waitForRun = async (
  db: DB,
  runId: number,
  expected: Pick<PipelineRun, "status" | "processed" | "failed">,
) => {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const [run] = await db
      .select()
      .from(pipelineRunsTable)
      .where(eq(pipelineRunsTable.runId, runId));
    if (
      run?.status === expected.status &&
      run.processed === expected.processed &&
      run.failed === expected.failed
    )
      return run;
    await delay(25);
  }
  throw new Error(
    `Pipeline run ${runId} did not reach ${JSON.stringify(expected)}`,
  );
};

interface Scenario {
  db: DB;
  admin: Admin;
  hub: RedisPipelineHub;
  campaignId: number;
}

class WebsitePages extends BaseWebPageFetcher {
  public override async fetchHtml(url: string): Promise<string | null> {
    return url === "https://ann.example.com/contact"
      ? "Contact hello@ann.example.com"
      : null;
  }
}

const withPipeline = async (
  scrapper: FakeSkoolScrapper,
  webSearch: FakeWebSearch,
  run: (scenario: Scenario) => Promise<void>,
) => {
  await withTestDatabase(async ({ db, pool }) => {
    const base = createContext(db, pool, initENV());
    const hub = new RedisPipelineHub(base);
    const context: Context = {
      ...base,
      queueHub: hub,
      skoolScrapper: scrapper,
      webSearch,
      webPageFetcher: new WebsitePages(),
    };
    try {
      await new ScrapeWorker({ context }).run();
      await new EnrichWorker({ context }).run();
      await new WebsiteWorker({ context }).run();
      const admin = await createAdminClient(
        context,
        "pipeline-queue@example.com",
      );
      const campaign = await insertCampaign(db);
      await run({ db, admin, hub, campaignId: campaign.campaignId });
    } finally {
      await hub.close();
    }
  });
};

const scrapperFor = (slugs: string[]) =>
  new FakeSkoolScrapper({
    pages: { 1: slugs.map((slug) => paidMonthly(slug)) },
    owners: Object.fromEntries(
      slugs.map((slug) => [`https://www.skool.com/${slug}`, "ann"]),
    ),
  });

const contactResults = () => [
  {
    title: "Lead ann",
    url: "https://ann.example.com/contact",
    content: "Lead ann: ann@ann.example.com",
  },
];

test("campaign HTTP actions execute through Redis and persist each stage without duplicate outcomes", async () => {
  await withPipeline(
    scrapperFor(["alpha", "beta"]),
    new FakeWebSearch(contactResults),
    async ({ db, admin, hub, campaignId }) => {
      const scrapeId = await start(admin, campaignId, "scrape");
      const scrape = await waitForRun(db, scrapeId, {
        status: "done",
        processed: 2,
        failed: 0,
      });
      expect(scrape).toMatchObject({ campaignId, total: 2, itemsReady: true });
      const leads = await db.select().from(leadsTable);
      expect(leads).toHaveLength(1);
      const lead = leads[0];
      if (!lead) throw new Error("The scrape did not persist its lead");
      const communities = await db.select().from(communitiesTable);
      expect(communities).toHaveLength(2);
      expect(communities.map((community) => community.leadId)).toEqual([
        lead.leadId,
        lead.leadId,
      ]);
      const scrapedItems = await db
        .select()
        .from(pipelineItemsTable)
        .where(eq(pipelineItemsTable.runId, scrapeId));
      expect(scrapedItems.map((item) => item.itemKey).toSorted()).toEqual([
        "https://www.skool.com/alpha",
        "https://www.skool.com/beta",
      ]);
      expect(
        scrapedItems.map((item) => ({
          status: item.status,
          leadId: item.leadId,
        })),
      ).toEqual([
        { status: "processed", leadId: lead.leadId },
        { status: "processed", leadId: lead.leadId },
      ]);

      const enrichId = await start(admin, campaignId, "enrich");
      const enrich = await waitForRun(db, enrichId, {
        status: "done",
        processed: 1,
        failed: 0,
      });
      expect(enrich).toMatchObject({ total: 1, itemsReady: true });
      const beforeDuplicate = await db
        .select()
        .from(pipelineItemsTable)
        .where(eq(pipelineItemsTable.runId, enrichId));
      expect(beforeDuplicate).toHaveLength(1);
      expect(beforeDuplicate[0]).toMatchObject({
        itemKey: `lead:${lead.leadId}`,
        leadId: lead.leadId,
        status: "processed",
        website: "https://ann.example.com",
        error: null,
      });
      expect(await leadEmailRows(db, lead.leadId)).toEqual([
        { address: "ann@example.com", source: "skool" },
        { address: "ann@ann.example.com", source: "tavily" },
      ]);
      const [savedLead] = await db
        .select()
        .from(leadsTable)
        .where(eq(leadsTable.leadId, lead.leadId));
      expect(savedLead).toMatchObject({
        website: "https://ann.example.com",
        enrichedAt: expect.any(Date),
      });

      await hub.enrich.add({
        type: "enrich-lead",
        runId: enrichId,
        leadId: lead.leadId,
      });
      const deadline = Date.now() + 10_000;
      while ((await hub.enrich.getCounts()).completed < 2) {
        if (Date.now() >= deadline)
          throw new Error("The duplicate delivery did not finish");
        await delay(25);
      }
      const afterDuplicate = await db
        .select()
        .from(pipelineItemsTable)
        .where(eq(pipelineItemsTable.runId, enrichId));
      expect(afterDuplicate).toEqual(beforeDuplicate);
      const [storedRun] = await db
        .select()
        .from(pipelineRunsTable)
        .where(eq(pipelineRunsTable.runId, enrichId));
      expect(storedRun).toMatchObject({
        status: "done",
        total: 1,
        processed: 1,
        failed: 0,
      });

      const websiteId = await start(admin, campaignId, "website");
      const website = await waitForRun(db, websiteId, {
        status: "done",
        processed: 1,
        failed: 0,
      });
      expect(website).toMatchObject({ total: 1, itemsReady: true });
      const websiteItems = await db
        .select()
        .from(pipelineItemsTable)
        .where(eq(pipelineItemsTable.runId, websiteId));
      expect(websiteItems).toMatchObject([
        {
          leadId: lead.leadId,
          status: "processed",
          website: "https://ann.example.com",
          error: null,
        },
      ]);
      expect(await leadEmailRows(db, lead.leadId)).toEqual([
        { address: "ann@example.com", source: "skool" },
        { address: "ann@ann.example.com", source: "tavily" },
        { address: "hello@ann.example.com", source: "website" },
      ]);
    },
  );
});

test("retrying a failed enrichment through the queue API corrects a finished run's database outcome", async () => {
  let failing = true;
  const search = new FakeWebSearch(() => {
    if (failing)
      throw new WebSearchError({
        message: "provider rejected request",
        retryable: false,
      });
    return contactResults();
  });
  await withPipeline(
    scrapperFor(["alpha"]),
    search,
    async ({ db, admin, hub, campaignId }) => {
      const scrapeId = await start(admin, campaignId, "scrape");
      await waitForRun(db, scrapeId, {
        status: "done",
        processed: 1,
        failed: 0,
      });
      const enrichId = await start(admin, campaignId, "enrich");
      await waitForRun(db, enrichId, {
        status: "done",
        processed: 0,
        failed: 1,
      });
      const failedItems = await db
        .select()
        .from(pipelineItemsTable)
        .where(eq(pipelineItemsTable.runId, enrichId));
      expect(failedItems).toHaveLength(1);
      expect(failedItems[0]).toMatchObject({
        status: "failed",
        error: "provider rejected request",
        website: null,
      });
      const [beforeRetry] = await db.select().from(leadsTable);
      expect(beforeRetry).toMatchObject({ website: null, enrichedAt: null });
      const deadline = Date.now() + 10_000;
      let failed = await hub.enrich.listFailed({ start: 0, end: 10 });
      while (failed.jobs.length === 0) {
        if (Date.now() >= deadline)
          throw new Error("Redis did not record the failed enrichment");
        await delay(25);
        failed = await hub.enrich.listFailed({ start: 0, end: 10 });
      }
      const job = failed.jobs[0];
      if (!job) throw new Error("The enrichment job was not in Redis");
      failing = false;
      const response = await admin.post(
        `/api/queues/enrich/failed/${job.id}/retry`,
      );
      expect(response.status).toBe(204);
      await waitForRun(db, enrichId, {
        status: "done",
        processed: 1,
        failed: 0,
      });
      const retriedItems = await db
        .select()
        .from(pipelineItemsTable)
        .where(eq(pipelineItemsTable.runId, enrichId));
      expect(retriedItems).toHaveLength(1);
      expect(retriedItems[0]).toMatchObject({
        status: "processed",
        website: "https://ann.example.com",
        error: null,
      });
      const [afterRetry] = await db.select().from(leadsTable);
      expect(afterRetry).toMatchObject({
        website: "https://ann.example.com",
        enrichedAt: expect.any(Date),
      });
    },
  );
});

test("deleting a campaign cascades its Redis-produced run results and preserves another campaign's shared lead", async () => {
  await withPipeline(
    scrapperFor(["alpha"]),
    new FakeWebSearch(contactResults),
    async ({ db, admin, campaignId }) => {
      const scrapeId = await start(admin, campaignId, "scrape");
      await waitForRun(db, scrapeId, {
        status: "done",
        processed: 1,
        failed: 0,
      });
      const enrichId = await start(admin, campaignId, "enrich");
      await waitForRun(db, enrichId, {
        status: "done",
        processed: 1,
        failed: 0,
      });
      const other = await insertCampaign(db, { name: "Other" });
      const otherScrapeId = await start(admin, other.campaignId, "scrape");
      await waitForRun(db, otherScrapeId, {
        status: "done",
        processed: 1,
        failed: 0,
      });
      const sharedLeads = await db.select().from(leadsTable);
      const sharedCommunities = await db.select().from(communitiesTable);
      const otherItems = await db
        .select()
        .from(pipelineItemsTable)
        .where(eq(pipelineItemsTable.runId, otherScrapeId));
      expect(otherItems).toHaveLength(1);
      const otherItem = otherItems[0];
      if (!otherItem || otherItem.leadId === null)
        throw new Error("The other campaign has no saved lead");
      const response = await admin.delete(`/api/campaigns/${campaignId}`);
      expect(response.status).toBe(204);
      const removedRuns = await db
        .select()
        .from(pipelineRunsTable)
        .where(eq(pipelineRunsTable.campaignId, campaignId));
      const removedItems = await db
        .select()
        .from(pipelineItemsTable)
        .where(inArray(pipelineItemsTable.runId, [scrapeId, enrichId]));
      const removedCampaigns = await db
        .select()
        .from(campaignsTable)
        .where(eq(campaignsTable.campaignId, campaignId));
      expect(removedCampaigns).toEqual([]);
      expect(removedRuns).toEqual([]);
      expect(removedItems).toEqual([]);
      const remainingItems = await db
        .select()
        .from(pipelineItemsTable)
        .where(eq(pipelineItemsTable.runId, otherScrapeId));
      expect(remainingItems).toEqual(otherItems);
      const remainingLeads = await db.select().from(leadsTable);
      const remainingCommunities = await db.select().from(communitiesTable);
      expect(remainingLeads).toEqual(sharedLeads);
      expect(remainingCommunities).toEqual(sharedCommunities);
      const links = await db.select().from(campaignLeadsTable);
      expect(links).toEqual([
        { campaignId: other.campaignId, leadId: otherItem.leadId },
      ]);
    },
  );
});

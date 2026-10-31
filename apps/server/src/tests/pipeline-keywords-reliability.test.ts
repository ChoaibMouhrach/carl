import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { Queue } from "bullmq";
import { eq } from "drizzle-orm";
import IORedis from "ioredis";
import z from "zod";
import { initENV } from "@server/config/env";
import type { Context } from "@server/context";
import type { DB } from "@server/infrastructure/database/client";
import {
  campaignCommunitiesTable,
  communitiesTable,
  leadsTable,
  pipelineItemsTable,
  pipelineRunKeywordsTable,
  pipelineRunsTable,
} from "@server/infrastructure/database/schemas";
import { BullQueue, ScrapeQueue } from "@server/infrastructure/queue/bullmq";
import {
  BaseQueueHub,
  type DiscoverJob,
  type RegisteredQueue,
  type ScrapeJob,
} from "@server/lib/base-queue";
import { SkoolScrapeError } from "@server/lib/base-skool-scrapper";
import { ScrapeService } from "@server/services/scrape";
import { DiscoverWorker } from "@server/workers/discover";
import { ScrapeWorker } from "@server/workers/scrape";
import { createAdminClient } from "./helpers/api";
import { createContext, TestQueue } from "./helpers/context";
import { withTestDatabase } from "./helpers/http";
import { ManualQueue, insertCampaign, runRows } from "./helpers/pipeline";
import { KeywordScrapper, paidMonthly } from "./helpers/skool";

const SKOOL = "https://www.skool.com";
const runIdSchema = z.object({ runId: z.number() });

type Admin = Awaited<ReturnType<typeof createAdminClient>>;

const waitUntil = async (condition: () => Promise<boolean>) => {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error("The condition was never met.");
};

const startScrape = async (admin: Admin, campaignId: number) => {
  const response = await admin.post(
    `/api/campaigns/${campaignId}/pipeline/scrape`,
  );
  expect(response.status).toBe(202);

  return runIdSchema.parse(await response.json()).runId;
};

const settledRun = async (db: DB, runId: number) => {
  await waitUntil(async () => {
    const [run] = await db
      .select()
      .from(pipelineRunsTable)
      .where(eq(pipelineRunsTable.runId, runId));
    return run?.status !== "running";
  });
  const [run] = await db
    .select()
    .from(pipelineRunsTable)
    .where(eq(pipelineRunsTable.runId, runId));
  if (!run) throw new Error("The run disappeared.");

  return run;
};

// Real BullMQ queues on Redis under private names; the other queues stay in memory
class ReliabilityHub extends BaseQueueHub {
  public email: Context["queueHub"]["email"];
  public maintenance: Context["queueHub"]["maintenance"];
  public enrich: Context["queueHub"]["enrich"];
  public website: Context["queueHub"]["website"];
  public fullenrich: Context["queueHub"]["fullenrich"];
  public discover: BullQueue<DiscoverJob>;
  public scrape: ScrapeQueue;
  private readonly names: string[];
  private readonly redisUrl: string;

  public constructor(context: Context) {
    super();
    const suffix = randomUUID();
    const discoverName = `test-keywords-discover-${suffix}`;
    const scrapeName = `test-keywords-scrape-${suffix}`;
    this.names = [discoverName, scrapeName];
    this.redisUrl = context.env.REDIS_CONNECTION_STRING;
    this.email = context.queueHub.email;
    this.maintenance = context.queueHub.maintenance;
    this.enrich = context.queueHub.enrich;
    this.website = context.queueHub.website;
    this.fullenrich = context.queueHub.fullenrich;
    this.discover = new BullQueue<DiscoverJob>({
      name: discoverName,
      jobName: "run",
      concurrency: 2,
      backoffDelayMs: 50,
      redisUrl: this.redisUrl,
      errorMonitor: context.errorMonitor,
      logger: context.logger,
    });
    this.scrape = new ScrapeQueue({
      name: scrapeName,
      concurrency: 2,
      redisUrl: this.redisUrl,
      errorMonitor: context.errorMonitor,
      logger: context.logger,
    });
  }

  public override queues(): RegisteredQueue[] {
    return [
      { name: "discover", queue: this.discover },
      { name: "scrape", queue: this.scrape },
    ];
  }

  public override async close(): Promise<void> {
    await Promise.all([this.discover.close(), this.scrape.close()]);
    const connection = new IORedis(this.redisUrl, {
      maxRetriesPerRequest: null,
    });

    try {
      for (const name of this.names) {
        const queue = new Queue(name, { connection });
        await queue.obliterate({ force: true });
        await queue.close();
      }
    } finally {
      await connection.quit();
    }
  }
}

const withRedis = async (
  scrapper: KeywordScrapper,
  keywords: string[],
  run: (scenario: {
    db: DB;
    admin: Admin;
    campaignId: number;
    hub: ReliabilityHub;
  }) => Promise<void>,
) => {
  await withTestDatabase(async ({ db, pool }) => {
    const base = createContext(db, pool, initENV());
    const hub = new ReliabilityHub(base);
    const context: Context = {
      ...base,
      queueHub: hub,
      skoolScrapper: scrapper,
    };

    try {
      await new DiscoverWorker({ context }).run();
      await new ScrapeWorker({ context }).run();
      const admin = await createAdminClient(
        context,
        "keywords-reliability@example.com",
      );
      const campaign = await insertCampaign(db, { keywords });
      await run({ db, admin, campaignId: campaign.campaignId, hub });
    } finally {
      await hub.close();
    }
  });
};

const storedRows = async (db: DB, runId: number) => ({
  leads: await db.select().from(leadsTable),
  communities: await db.select().from(communitiesTable),
  links: await db.select().from(campaignCommunitiesTable),
  items: await db
    .select()
    .from(pipelineItemsTable)
    .where(eq(pipelineItemsTable.runId, runId)),
  keywords: await db
    .select()
    .from(pipelineRunKeywordsTable)
    .where(eq(pipelineRunKeywordsTable.runId, runId)),
});

const overlapping = () =>
  new KeywordScrapper({
    one: [paidMonthly("alpha"), paidMonthly("beta")],
    two: [paidMonthly("beta"), paidMonthly("gamma")],
    three: [paidMonthly("gamma"), paidMonthly("delta")],
  });

test("overlapping keywords run through Redis into exactly one item, community and link each", async () => {
  const scrapper = overlapping();

  await withRedis(
    scrapper,
    ["one", "two", "three"],
    async ({ db, admin, campaignId }) => {
      const runId = await startScrape(admin, campaignId);
      const run = await settledRun(db, runId);

      expect(run).toMatchObject({
        status: "done",
        itemsReady: true,
        total: 4,
        processed: 4,
        failed: 0,
        error: null,
      });
      const rows = await storedRows(db, runId);
      expect(rows.items).toHaveLength(4);
      expect(rows.items.every((item) => item.status === "processed")).toBe(
        true,
      );
      expect(rows.leads).toHaveLength(4);
      expect(rows.communities).toHaveLength(4);
      expect(rows.links).toHaveLength(4);
      expect(rows.keywords.map((row) => row.status)).toEqual([
        "done",
        "done",
        "done",
      ]);
      expect(scrapper.aboutCalls.toSorted()).toEqual([
        `${SKOOL}/alpha`,
        `${SKOOL}/beta`,
        `${SKOOL}/delta`,
        `${SKOOL}/gamma`,
      ]);
    },
  );
});

test("a transient failure on one keyword is retried by the queue and leaves the run clean", async () => {
  const scrapper = new KeywordScrapper({
    one: [paidMonthly("alpha")],
    two: [paidMonthly("beta")],
  });
  scrapper.discoverFailures["two"] = {
    error: new SkoolScrapeError({ kind: "rate_limited", message: "slow" }),
    remaining: 2,
  };

  await withRedis(
    scrapper,
    ["one", "two"],
    async ({ db, admin, campaignId }) => {
      const runId = await startScrape(admin, campaignId);
      const run = await settledRun(db, runId);

      expect(run).toMatchObject({
        status: "done",
        total: 2,
        processed: 2,
        failed: 0,
        error: null,
      });
      expect(
        scrapper.discoverCalls.filter((call) => call.search === "two"),
      ).toHaveLength(3);
      const rows = await storedRows(db, runId);
      expect(
        rows.keywords.map((row) => [row.keyword, row.status]).sort(),
      ).toEqual([
        ["one", "done"],
        ["two", "done"],
      ]);
      expect(rows.communities).toHaveLength(2);
    },
  );
});

test("a keyword that cannot be retried fails after one attempt without stopping the others", async () => {
  const shapeError = z.object({ name: z.string() }).safeParse({}).error;
  if (!shapeError) throw new Error("expected a ZodError");
  const scrapper = new KeywordScrapper({
    one: [paidMonthly("alpha")],
    two: [paidMonthly("beta")],
  });
  scrapper.discoverFailures["two"] = {
    error: shapeError,
    remaining: Number.POSITIVE_INFINITY,
  };

  await withRedis(
    scrapper,
    ["one", "two"],
    async ({ db, admin, campaignId }) => {
      const runId = await startScrape(admin, campaignId);
      const run = await settledRun(db, runId);

      expect(run).toMatchObject({
        status: "done",
        itemsReady: true,
        total: 1,
        processed: 1,
      });
      expect(run.error).toContain("two");
      expect(
        scrapper.discoverCalls.filter((call) => call.search === "two"),
      ).toHaveLength(1);
      const rows = await storedRows(db, runId);
      expect(
        rows.keywords.map((row) => [row.keyword, row.status]).sort(),
      ).toEqual([
        ["one", "done"],
        ["two", "failed"],
      ]);
      expect(rows.communities.map((row) => row.skoolUrl)).toEqual([
        `${SKOOL}/alpha`,
      ]);
    },
  );
});

const bootManual = async (
  db: DB,
  pool: Parameters<typeof createContext>[1],
  scrapper: KeywordScrapper,
  discover: ManualQueue<DiscoverJob> = new ManualQueue<DiscoverJob>(),
  scrape: TestQueue<ScrapeJob> | undefined = undefined,
) => {
  const context = createContext(db, pool, initENV());
  context.skoolScrapper = scrapper;
  context.queueHub.discover = discover;
  if (scrape) context.queueHub.scrape = scrape;
  await new DiscoverWorker({ context }).run();
  await new ScrapeWorker({ context }).run();
  const admin = await createAdminClient(context, "keywords-manual@example.com");

  return { context, admin, discover };
};

test("keywords finishing at the same moment settle the run exactly once", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scrapper = new KeywordScrapper({
      a: [paidMonthly("s1"), paidMonthly("s2")],
      b: [paidMonthly("s2"), paidMonthly("s3")],
      c: [paidMonthly("s3"), paidMonthly("s4")],
      d: [paidMonthly("s4"), paidMonthly("s5")],
      e: [paidMonthly("s5"), paidMonthly("s1")],
    });
    const { admin, discover } = await bootManual(db, pool, scrapper);
    const campaign = await insertCampaign(db, {
      keywords: ["a", "b", "c", "d", "e"],
    });
    const runId = await startScrape(admin, campaign.campaignId);

    await Promise.all(discover.added.map((job) => discover.deliver(job)));

    const [run] = await runRows(db);
    expect(run).toMatchObject({
      runId,
      status: "done",
      itemsReady: true,
      total: 5,
      processed: 5,
      failed: 0,
      error: null,
    });
    const rows = await storedRows(db, runId);
    expect(rows.items).toHaveLength(5);
    expect(rows.communities).toHaveLength(5);
    expect(rows.keywords.every((row) => row.status === "done")).toBe(true);
    expect(scrapper.aboutCalls).toHaveLength(5);
  });
});

class FlakyQueue<Input> extends TestQueue<Input> {
  public outage = false;

  public constructor() {
    super({ process: async () => {} });
  }

  public override async add(
    input: Input,
    options?: Parameters<TestQueue<Input>["add"]>[1],
  ): Promise<void> {
    if (this.outage) throw new Error("scrape queue is down");

    await super.add(input, options);
  }
}

test("an outage after the keyword is saved loses nothing: the redelivered job scrapes the pending items once", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scrapper = new KeywordScrapper({
      yoga: [paidMonthly("alpha"), paidMonthly("beta")],
    });
    const scrape = new FlakyQueue<ScrapeJob>();
    const { admin, discover } = await bootManual(
      db,
      pool,
      scrapper,
      undefined,
      scrape,
    );
    const campaign = await insertCampaign(db, { keywords: ["yoga"] });
    const runId = await startScrape(admin, campaign.campaignId);
    const [job] = discover.added;
    if (!job) throw new Error("expected a discover job");
    scrape.outage = true;

    await expect(discover.deliver(job)).rejects.toThrow("scrape queue is down");

    const interrupted = await storedRows(db, runId);
    expect(interrupted.keywords.map((row) => row.status)).toEqual(["done"]);
    expect(interrupted.items.map((item) => item.status)).toEqual([
      "pending",
      "pending",
    ]);
    expect(scrapper.aboutCalls).toHaveLength(0);

    scrape.outage = false;
    await discover.deliver(job);

    const [run] = await runRows(db);
    expect(run).toMatchObject({
      status: "done",
      total: 2,
      processed: 2,
      failed: 0,
    });
    const recovered = await storedRows(db, runId);
    expect(recovered.items.every((item) => item.status === "processed")).toBe(
      true,
    );
    expect(recovered.communities).toHaveLength(2);
    expect(scrapper.aboutCalls.toSorted()).toEqual([
      `${SKOOL}/alpha`,
      `${SKOOL}/beta`,
    ]);
    expect(scrapper.discoverCalls).toHaveLength(1);
  });
});

test("a late final-attempt failure never undoes a keyword that already finished", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scrapper = new KeywordScrapper({ yoga: [paidMonthly("alpha")] });
    const { context, admin, discover } = await bootManual(db, pool, scrapper);
    const campaign = await insertCampaign(db, { keywords: ["yoga"] });
    const runId = await startScrape(admin, campaign.campaignId);
    const [job] = discover.added;
    if (!job) throw new Error("expected a discover job");
    await discover.deliver(job);
    const before = await runRows(db);

    await new ScrapeService({ context }).recordDiscoverFailure(
      job,
      new Error("late failure"),
    );

    expect(await runRows(db)).toEqual(before);
    const rows = await storedRows(db, runId);
    expect(rows.keywords.map((row) => [row.status, row.error])).toEqual([
      ["done", null],
    ]);
  });
});

class FailsOnSecondAdd<Input> extends ManualQueue<Input> {
  private calls = 0;

  public override async add(
    input: Input,
    options?: Parameters<ManualQueue<Input>["add"]>[1],
  ): Promise<void> {
    this.calls += 1;
    if (this.calls === 2) throw new Error("redis is down");

    await super.add(input, options);
  }
}

test("a job left over from a run that failed to start does nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scrapper = new KeywordScrapper({
      yoga: [paidMonthly("alpha")],
      pilates: [paidMonthly("beta")],
    });
    const { admin, discover } = await bootManual(
      db,
      pool,
      scrapper,
      new FailsOnSecondAdd<DiscoverJob>(),
    );
    const campaign = await insertCampaign(db, {
      keywords: ["yoga", "pilates"],
    });

    const refused = await admin.post(
      `/api/campaigns/${campaign.campaignId}/pipeline/scrape`,
    );

    expect(refused.status).toBe(500);
    const [failed] = await runRows(db);
    expect(failed).toMatchObject({ status: "failed", error: "redis is down" });
    const [stale] = discover.added;
    if (!stale) throw new Error("expected the first job to be queued");

    await discover.deliver(stale);

    expect(scrapper.discoverCalls).toHaveLength(0);
    expect(await runRows(db)).toEqual([failed]);
    const rows = await storedRows(db, failed?.runId ?? 0);
    expect(rows.items).toHaveLength(0);
    expect(rows.communities).toHaveLength(0);
  });
});

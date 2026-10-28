import { afterEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import z from "zod";
import { initENV } from "@server/config/env";
import type { Context } from "@server/context";
import type { DB } from "@server/infrastructure/database/client";
import { ScrapeQueue } from "@server/infrastructure/queue/bullmq";
import {
  BaseErrorMonitor,
  type ErrorMonitorScope,
} from "@server/lib/base-error-monitor";
import { BaseQueueHub, type RegisteredQueue } from "@server/lib/base-queue";
import { SkoolScrapeError } from "@server/lib/base-skool-scrapper";
import { ScrapeService } from "@server/services/scrape";
import { ScrapeWorker } from "@server/workers/scrape";
import { createAdminClient } from "./helpers/api";
import { createContext, TestLogger, TestMailer } from "./helpers/context";
import { withTestDatabase } from "./helpers/http";
import { FakeSkoolScrapper, paidMonthly, tableRows } from "./helpers/skool";

class RecordingErrorMonitor extends BaseErrorMonitor {
  public captured: { error: unknown; scope?: ErrorMonitorScope }[] = [];

  public override captureException(
    error: unknown,
    scope?: ErrorMonitorScope,
  ): void {
    this.captured.push({ error, scope });
  }

  public override flush(): Promise<void> {
    return Promise.resolve();
  }
}

const redisUrl = initENV().REDIS_CONNECTION_STRING;
const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

const waitUntil = async (condition: () => Promise<boolean> | boolean) => {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (await condition()) return;
    await sleep(25);
  }

  throw new Error("The condition was never met.");
};

// The real scrape queue on Redis under a private name; email and maintenance stay in memory
class RealScrapeHub extends BaseQueueHub {
  public email;
  public maintenance;
  public scrape: ScrapeQueue;

  public constructor(init: {
    base: Context["queueHub"];
    errorMonitor: BaseErrorMonitor;
    logger: TestLogger;
    name: string;
  }) {
    super();
    this.email = init.base.email;
    this.maintenance = init.base.maintenance;
    this.scrape = new ScrapeQueue({
      concurrency: 2,
      errorMonitor: init.errorMonitor,
      logger: init.logger,
      name: init.name,
      redisUrl,
    });
  }

  public override queues(): RegisteredQueue[] {
    return [{ name: "scrape", queue: this.scrape }];
  }

  public override async close(): Promise<void> {
    await this.scrape.close();
  }
}

const boot = async (
  db: DB,
  pool: Parameters<typeof createContext>[1],
  scrapper: FakeSkoolScrapper,
) => {
  const base = createContext(db, pool, initENV(), new TestMailer());
  const errorMonitor = new RecordingErrorMonitor();
  const logger = new TestLogger();
  const name = `test-scrape-${randomUUID()}`;
  const hub = new RealScrapeHub({
    base: base.queueHub,
    errorMonitor,
    logger,
    name,
  });
  const context: Context = {
    ...base,
    errorMonitor,
    logger,
    queueHub: hub,
    skoolScrapper: scrapper,
  };

  cleanups.push(async () => {
    await hub.close();
    const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    const leftover = new Queue(name, { connection });
    await leftover.obliterate({ force: true });
    await leftover.close();
    await connection.quit();
  });

  await new ScrapeWorker({ context }).run();

  return { context, hub, errorMonitor, logger };
};

const idle = async (hub: RealScrapeHub) => {
  const counts = await hub.scrape.getCounts();
  return counts.waiting + counts.active + counts.delayed === 0;
};

const owners = (slugs: string[]) =>
  Object.fromEntries(
    slugs.map((slug) => [`https://www.skool.com/${slug}`, `owner-${slug}`]),
  );

test("a scrape started over HTTP runs through Redis and ends up in the database", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const slugs = ["alpha", "beta"];
    const scrapper = new FakeSkoolScrapper({
      pages: { 1: slugs.map((slug) => paidMonthly(slug, 4)) },
      owners: owners(slugs),
    });
    const { context, hub, errorMonitor } = await boot(db, pool, scrapper);
    const admin = await createAdminClient(context, "scrape-queue@example.com");

    const response = await admin.post("/api/scrape", { search: "coaching" });

    expect(response.status).toBe(202);
    await waitUntil(async () => (await hub.scrape.getCounts()).completed === 5);

    // One discover job, then a community job and a lead job for each community
    expect(await hub.scrape.getCounts()).toMatchObject({
      completed: 5,
      failed: 0,
    });
    expect(errorMonitor.captured).toEqual([]);
    const rows = await tableRows(db);
    expect(rows.leads.map((row) => row.username).toSorted()).toEqual([
      "owner-alpha",
      "owner-beta",
    ]);
    expect(rows.communities).toHaveLength(2);
    expect(rows.communities.find((row) => row.name === "ALPHA")).toMatchObject({
      skoolUrl: "https://www.skool.com/alpha",
      members: 4,
      mrr: 108,
      isFree: false,
      priceCents: 2700,
      priceCurrency: "usd",
      priceInterval: "month",
      email: "alpha@example.com",
    });
  });
});

test("a permanent failure is tried once, reported once and writes nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const shapeError = z.object({ name: z.string() }).safeParse({}).error;
    if (!shapeError) throw new Error("expected a ZodError");

    const scrapper = new FakeSkoolScrapper({
      pages: { 1: [paidMonthly("alpha")] },
      owners: owners(["alpha"]),
    });
    scrapper.leadFailures["owner-alpha"] = {
      error: shapeError,
      remaining: Number.POSITIVE_INFINITY,
    };
    const { context, hub, errorMonitor, logger } = await boot(
      db,
      pool,
      scrapper,
    );

    await new ScrapeService({ context }).start({ search: "coaching" });
    await waitUntil(async () => (await hub.scrape.getCounts()).failed === 1);
    await waitUntil(async () => await idle(hub));

    // The queue allows five attempts, but a changed page shape cannot be fixed by retrying
    expect(scrapper.leadCalls).toHaveLength(1);
    const failed = await hub.scrape.listFailed({ start: 0, end: 10 });
    expect(failed.jobs.map((job) => job.attemptsMade)).toEqual([1]);
    expect(errorMonitor.captured).toHaveLength(1);
    expect(errorMonitor.captured[0]?.scope?.tags).toMatchObject({
      signal: "job_failed",
    });
    expect(
      logger.records.filter((record) => record.level === "error"),
    ).toHaveLength(1);
    expect(await tableRows(db)).toEqual({ leads: [], communities: [] });
  });
});

const permanentFailure = () => {
  const error = z.object({ name: z.string() }).safeParse({}).error;
  if (!error) throw new Error("expected a ZodError");
  return error;
};

test("a transient failure is retried by the queue and then stored, without alerting", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scrapper = new FakeSkoolScrapper({
      pages: { 1: [paidMonthly("alpha")] },
      owners: owners(["alpha"]),
    });
    scrapper.leadFailures["owner-alpha"] = {
      error: new SkoolScrapeError({ kind: "rate_limited", message: "slow" }),
      remaining: 1,
    };
    const { context, hub, errorMonitor, logger } = await boot(
      db,
      pool,
      scrapper,
    );

    await new ScrapeService({ context }).start({ search: "coaching" });
    await waitUntil(async () => (await hub.scrape.getCounts()).completed === 3);

    expect(scrapper.leadCalls).toHaveLength(2);
    expect(await hub.scrape.getCounts()).toMatchObject({ failed: 0 });
    expect(errorMonitor.captured).toEqual([]);
    expect(
      logger.records.filter((record) => record.level === "warn"),
    ).toHaveLength(1);
    const rows = await tableRows(db);
    expect(rows.leads.map((row) => row.username)).toEqual(["owner-alpha"]);
    expect(rows.communities.map((row) => row.skoolUrl)).toEqual([
      "https://www.skool.com/alpha",
    ]);
  });
});

test("one community failing for good does not stop the others or leave a half-written lead", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scrapper = new FakeSkoolScrapper({
      pages: { 1: [paidMonthly("good"), paidMonthly("bad")] },
      owners: owners(["good", "bad"]),
    });
    scrapper.leadFailures["owner-bad"] = {
      error: permanentFailure(),
      remaining: Number.POSITIVE_INFINITY,
    };
    const { context, hub } = await boot(db, pool, scrapper);

    await new ScrapeService({ context }).start({ search: "coaching" });
    await waitUntil(async () => (await hub.scrape.getCounts()).failed === 1);
    await waitUntil(async () => await idle(hub));

    expect(await hub.scrape.getCounts()).toMatchObject({
      completed: 4,
      failed: 1,
    });
    const rows = await tableRows(db);
    expect(rows.leads.map((row) => row.username)).toEqual(["owner-good"]);
    expect(rows.communities.map((row) => row.skoolUrl)).toEqual([
      "https://www.skool.com/good",
    ]);
  });
});

test("a failed scrape job can be retried from the queue API once Skool works again", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scrapper = new FakeSkoolScrapper({
      pages: { 1: [paidMonthly("alpha")] },
      owners: owners(["alpha"]),
    });
    scrapper.leadFailures["owner-alpha"] = {
      error: permanentFailure(),
      remaining: Number.POSITIVE_INFINITY,
    };
    const { context, hub } = await boot(db, pool, scrapper);
    const admin = await createAdminClient(context, "scrape-retry@example.com");
    await new ScrapeService({ context }).start({ search: "coaching" });
    await waitUntil(async () => (await hub.scrape.getCounts()).failed === 1);
    await waitUntil(async () => await idle(hub));
    expect(await tableRows(db)).toEqual({ leads: [], communities: [] });

    delete scrapper.leadFailures["owner-alpha"];
    const [failed] = (await hub.scrape.listFailed({ start: 0, end: 10 })).jobs;
    if (!failed) throw new Error("expected a failed job");
    const response = await admin.post(
      `/api/queues/scrape/failed/${failed.id}/retry`,
    );

    expect(response.status).toBe(204);
    await waitUntil(async () => (await hub.scrape.getCounts()).failed === 0);
    await waitUntil(async () => (await tableRows(db)).communities.length === 1);
    const rows = await tableRows(db);
    expect(rows.leads.map((row) => row.username)).toEqual(["owner-alpha"]);
    expect(rows.communities[0]).toMatchObject({
      skoolUrl: "https://www.skool.com/alpha",
      leadId: rows.leads[0]?.leadId,
      priceCents: 2700,
    });
  });
});

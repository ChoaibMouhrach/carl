import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { initENV } from "@server/config/env";
import type { DB } from "@server/infrastructure/database/client";
import {
  campaignCommunitiesTable,
  pipelineItemsTable,
  pipelineRunKeywordsTable,
} from "@server/infrastructure/database/schemas";
import type { DiscoverJob } from "@server/lib/base-queue";
import type { Community } from "@server/lib/base-skool-scrapper";
import { DiscoverWorker } from "@server/workers/discover";
import { ScrapeWorker } from "@server/workers/scrape";
import { createAdminClient } from "./helpers/api";
import { createContext } from "./helpers/context";
import { withTestDatabase } from "./helpers/http";
import { ManualQueue, insertCampaign, runRows } from "./helpers/pipeline";
import { KeywordScrapper, paidMonthly } from "./helpers/skool";

type Pool = Parameters<typeof createContext>[1];

const SKOOL = "https://www.skool.com";

const boot = async (
  db: DB,
  pool: Pool,
  byKeyword: Record<string, Community[] | Error>,
  afterRecovery: Record<string, Community[]> = {},
) => {
  const context = createContext(db, pool, initENV());
  const scrapper = new KeywordScrapper(byKeyword, afterRecovery);
  context.skoolScrapper = scrapper;
  const discover = new ManualQueue<DiscoverJob>();
  context.queueHub.discover = discover;
  await new DiscoverWorker({ context }).run();
  await new ScrapeWorker({ context }).run();
  const admin = await createAdminClient(
    context,
    "pipeline-keywords@example.com",
  );

  return { context, admin, scrapper, discover };
};

const start = async (
  admin: Awaited<ReturnType<typeof boot>>["admin"],
  campaignId: number,
) => {
  const response = await admin.post(
    `/api/campaigns/${campaignId}/pipeline/scrape`,
  );
  expect(response.status).toBe(202);
};

const final = { isFinalAttempt: true };

test("starting a scrape queues one discover job per keyword with its own idempotency key", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, discover } = await boot(db, pool, {});
    const campaign = await insertCampaign(db, {
      keywords: ["Yoga", "pilates", "barre"],
      minMembers: 5,
    });

    await start(admin, campaign.campaignId);

    expect(discover.added.map((job) => job.search)).toEqual([
      "Yoga",
      "pilates",
      "barre",
    ]);
    expect(discover.added.every((job) => job.minMembers === 5)).toBe(true);
    expect(new Set(discover.added.map((job) => job.runId)).size).toBe(1);
    const [run] = await runRows(db);
    const keywordRows = await db
      .select()
      .from(pipelineRunKeywordsTable)
      .where(eq(pipelineRunKeywordsTable.runId, run?.runId ?? 0));
    expect(keywordRows.map((row) => [row.keyword, row.status]).sort()).toEqual([
      ["Yoga", "pending"],
      ["barre", "pending"],
      ["pilates", "pending"],
    ]);
  });
});

test("a community found by two keywords becomes one item, one scrape and one campaign link", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, discover, scrapper } = await boot(db, pool, {
      yoga: [paidMonthly("alpha"), paidMonthly("beta")],
      pilates: [paidMonthly("beta"), paidMonthly("gamma")],
    });
    const campaign = await insertCampaign(db, {
      keywords: ["yoga", "pilates"],
    });

    await start(admin, campaign.campaignId);
    for (const job of discover.added) await discover.deliver(job);

    expect(scrapper.aboutCalls.sort()).toEqual([
      `${SKOOL}/alpha`,
      `${SKOOL}/beta`,
      `${SKOOL}/gamma`,
    ]);
    const [run] = await runRows(db);
    expect(run).toMatchObject({
      status: "done",
      itemsReady: true,
      total: 3,
      processed: 3,
      failed: 0,
      error: null,
    });
    const items = await db
      .select()
      .from(pipelineItemsTable)
      .where(eq(pipelineItemsTable.runId, run?.runId ?? 0));
    expect(items).toHaveLength(3);
    const links = await db
      .select()
      .from(campaignCommunitiesTable)
      .where(eq(campaignCommunitiesTable.campaignId, campaign.campaignId));
    expect(links).toHaveLength(3);
  });
});

test("the run only becomes ready when the last keyword has resolved", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, discover } = await boot(db, pool, {
      yoga: [paidMonthly("alpha")],
      pilates: [paidMonthly("beta")],
    });
    const campaign = await insertCampaign(db, {
      keywords: ["yoga", "pilates"],
    });
    await start(admin, campaign.campaignId);
    const [yoga, pilates] = discover.added;
    if (!yoga || !pilates) throw new Error("expected two discover jobs");

    await discover.deliver(yoga);

    expect(await runRows(db)).toMatchObject([
      { status: "running", itemsReady: false, total: 1, processed: 1 },
    ]);

    await discover.deliver(pilates);

    expect(await runRows(db)).toMatchObject([
      { status: "done", itemsReady: true, total: 2, processed: 2 },
    ]);
  });
});

test("redelivering a finished keyword neither repeats the discovery nor the scraping", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, discover, scrapper } = await boot(db, pool, {
      yoga: [paidMonthly("alpha")],
    });
    const campaign = await insertCampaign(db, { keywords: ["yoga"] });
    await start(admin, campaign.campaignId);
    const [job] = discover.added;
    if (!job) throw new Error("expected a discover job");
    await discover.deliver(job);
    const before = await runRows(db);

    await discover.deliver(job);

    expect(await runRows(db)).toEqual(before);
    expect(scrapper.discoverCalls).toHaveLength(1);
    expect(scrapper.aboutCalls).toHaveLength(1);
  });
});

test("a keyword that fails for good does not stop the others and is named on the run", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, discover } = await boot(db, pool, {
      yoga: [paidMonthly("alpha")],
      pilates: new Error("search page changed"),
    });
    const campaign = await insertCampaign(db, {
      keywords: ["yoga", "pilates"],
    });
    await start(admin, campaign.campaignId);
    const [yoga, pilates] = discover.added;
    if (!yoga || !pilates) throw new Error("expected two discover jobs");

    await discover.deliver(yoga);
    await expect(discover.deliver(pilates, final)).rejects.toThrow(
      "search page changed",
    );

    expect(await runRows(db)).toMatchObject([
      {
        status: "done",
        itemsReady: true,
        total: 1,
        processed: 1,
        error: "Search failed for pilates: search page changed",
      },
    ]);
    const keywordRows = await db.select().from(pipelineRunKeywordsTable);
    expect(keywordRows.map((row) => [row.keyword, row.status]).sort()).toEqual([
      ["pilates", "failed"],
      ["yoga", "done"],
    ]);
  });
});

test("retrying a keyword that failed for good searches it again and adds its results to the finished run", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, discover, scrapper } = await boot(
      db,
      pool,
      { yoga: [paidMonthly("alpha")], pilates: new Error("blocked") },
      { pilates: [paidMonthly("beta"), paidMonthly("alpha")] },
    );
    const campaign = await insertCampaign(db, {
      keywords: ["yoga", "pilates"],
    });
    await start(admin, campaign.campaignId);
    const [yoga, pilates] = discover.added;
    if (!yoga || !pilates) throw new Error("expected two discover jobs");
    await discover.deliver(yoga);
    await expect(discover.deliver(pilates, final)).rejects.toThrow("blocked");
    expect(await runRows(db)).toMatchObject([
      { status: "done", total: 1, processed: 1, error: expect.any(String) },
    ]);

    scrapper.recover("pilates");
    await discover.deliver(pilates);

    expect(await runRows(db)).toMatchObject([
      {
        status: "done",
        itemsReady: true,
        total: 2,
        processed: 2,
        failed: 0,
        error: null,
      },
    ]);
    const keywordRows = await db.select().from(pipelineRunKeywordsTable);
    expect(
      keywordRows.map((row) => [row.keyword, row.status, row.error]).sort(),
    ).toEqual([
      ["pilates", "done", null],
      ["yoga", "done", null],
    ]);
    expect(scrapper.aboutCalls.toSorted()).toEqual([
      `${SKOOL}/alpha`,
      `${SKOOL}/beta`,
    ]);
  });
});

test("a retry that is not the last attempt leaves the keyword pending", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, discover } = await boot(db, pool, {
      yoga: new Error("flaky"),
    });
    const campaign = await insertCampaign(db, { keywords: ["yoga"] });
    await start(admin, campaign.campaignId);
    const [job] = discover.added;
    if (!job) throw new Error("expected a discover job");

    await expect(discover.deliver(job)).rejects.toThrow("flaky");

    expect(await runRows(db)).toMatchObject([
      { status: "running", itemsReady: false, error: null },
    ]);
    const [keyword] = await db.select().from(pipelineRunKeywordsTable);
    expect(keyword?.status).toBe("pending");
  });
});

test("the run fails with every reason when all keywords fail", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, discover } = await boot(db, pool, {
      yoga: new Error("blocked"),
      pilates: new Error("rate limited"),
    });
    const campaign = await insertCampaign(db, {
      keywords: ["yoga", "pilates"],
    });
    await start(admin, campaign.campaignId);

    for (const job of discover.added) {
      await expect(discover.deliver(job, final)).rejects.toThrow();
    }

    expect(await runRows(db)).toMatchObject([
      {
        status: "failed",
        error: "yoga: blocked; pilates: rate limited",
      },
    ]);
  });
});

import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { initENV } from "@server/config/env";
import type { DB } from "@server/infrastructure/database/client";
import {
  leadPagesTable,
  pipelineItemsTable,
  type LeadInsert,
} from "@server/infrastructure/database/schemas";
import type { PrepJob } from "@server/lib/base-queue";
import { BaseWebPageFetcher } from "@server/lib/base-web-page-fetcher";
import { PrepWorker } from "@server/workers/prep";
import { createContext } from "./helpers/context";
import { withTestDatabase } from "./helpers/http";
import {
  ManualQueue,
  insertCampaign,
  insertRun,
  leadPageRows,
  runRows,
} from "./helpers/pipeline";

type Pool = Parameters<typeof createContext>[1];

const SKOOL = "https://www.skool.com";

class FakeWebPageFetcher extends BaseWebPageFetcher {
  public requested: string[] = [];
  public error?: Error;

  public constructor(public pages: Record<string, string> = {}) {
    super();
  }

  public override async fetchHtml(url: string): Promise<string | null> {
    this.requested.push(url);
    if (this.error) throw this.error;
    return this.pages[url] ?? null;
  }
}

const boot = async (db: DB, pool: Pool, pages: Record<string, string> = {}) => {
  const context = createContext(db, pool, initENV());
  const queue = new ManualQueue<PrepJob>();
  const fetcher = new FakeWebPageFetcher(pages);
  context.queueHub.prep = queue;
  context.webPageFetcher = fetcher;
  await new PrepWorker({ context }).run();
  const campaign = await insertCampaign(db);

  const seedLead = async (
    username: string,
    values: Partial<LeadInsert> = {},
  ) => {
    const run = await insertRun(db, {
      campaignId: campaign.campaignId,
      step: "prep",
      total: 1,
    });
    const lead = await context.repositories.lead.create({
      name: username,
      username,
      skoolUrl: `${SKOOL}/@${username}`,
      website: `https://${username}.com`,
      ...values,
    });
    const job: PrepJob = {
      type: "prep-lead",
      runId: run.runId,
      leadId: lead.leadId,
    };

    return { run, lead, job };
  };

  const storedLead = async (leadId: number) =>
    await context.repositories.lead.findByLeadId({ leadId });

  return { context, queue, fetcher, campaign, seedLead, storedLead };
};

const HOME =
  "<html><head><title>Ann</title></head><body><h1>Ann Coach</h1><script>var a = 1;</script></body></html>";
const ABOUT = "<html><body><p>About   Ann\n  and her team</p></body></html>";
const SERVICES = "<html><body><ul><li>1:1 coaching</li></ul></body></html>";

test("the home, about and services pages are saved as the exact HTML that was fetched", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const b = await boot(db, pool, {
      "https://ann.com/": HOME,
      "https://ann.com/about": ABOUT,
      "https://ann.com/services": SERVICES,
    });
    const { lead, run, job } = await b.seedLead("ann");

    await b.queue.deliver(job);

    expect(b.fetcher.requested).toEqual([
      "https://ann.com/",
      "https://ann.com/about",
      "https://ann.com/services",
    ]);
    expect(await leadPageRows(db, lead.leadId)).toEqual([
      { path: "/", url: "https://ann.com/", html: HOME },
      { path: "/about", url: "https://ann.com/about", html: ABOUT },
      { path: "/services", url: "https://ann.com/services", html: SERVICES },
    ]);
    expect((await b.storedLead(lead.leadId))?.pagesFetchedAt).toBeInstanceOf(
      Date,
    );
    const items = await db
      .select()
      .from(pipelineItemsTable)
      .where(eq(pipelineItemsTable.runId, run.runId));
    expect(items).toMatchObject([{ leadId: lead.leadId, status: "processed" }]);
    expect(await runRows(db)).toMatchObject([
      { runId: run.runId, status: "done", processed: 1, failed: 0 },
    ]);
  });
});

test("a page that cannot be fetched is skipped and the others are still saved", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const b = await boot(db, pool, {
      "https://ann.com/": HOME,
      "https://ann.com/services": SERVICES,
    });
    const { lead, job } = await b.seedLead("ann");

    await b.queue.deliver(job);

    expect(await leadPageRows(db, lead.leadId)).toEqual([
      { path: "/", url: "https://ann.com/", html: HOME },
      { path: "/services", url: "https://ann.com/services", html: SERVICES },
    ]);
  });
});

test("a missing page that redirects to the homepage is saved once, under the first path", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const b = await boot(db, pool, {
      "https://ann.com/": HOME,
      "https://ann.com/about": HOME,
      "https://ann.com/services": HOME,
    });
    const { lead, job } = await b.seedLead("ann");

    await b.queue.deliver(job);

    expect(await leadPageRows(db, lead.leadId)).toEqual([
      { path: "/", url: "https://ann.com/", html: HOME },
    ]);
  });
});

test("a site with no reachable pages saves nothing but is still marked as fetched", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const b = await boot(db, pool);
    const { lead, run, job } = await b.seedLead("ann");

    await b.queue.deliver(job);

    expect(b.fetcher.requested).toHaveLength(3);
    expect(await leadPageRows(db, lead.leadId)).toEqual([]);
    expect((await b.storedLead(lead.leadId))?.pagesFetchedAt).toBeInstanceOf(
      Date,
    );
    expect(await runRows(db)).toMatchObject([
      { runId: run.runId, status: "done", processed: 1, failed: 0 },
    ]);
  });
});

test("a lead without a usable website is finished without fetching anything", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const b = await boot(db, pool, { "https://ann.com/": HOME });

    for (const [username, website] of [
      ["nosite", null],
      ["badsite", "ftp://ann.com"],
    ] as const) {
      const { lead, job } = await b.seedLead(username, { website });

      await b.queue.deliver(job);

      expect(await leadPageRows(db, lead.leadId)).toEqual([]);
    }

    expect(b.fetcher.requested).toEqual([]);
    expect(await runRows(db)).toMatchObject([
      { status: "done", processed: 1 },
      { status: "done", processed: 1 },
    ]);
  });
});

test("preparing a lead again replaces its pages and leaves other leads' pages alone", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const b = await boot(db, pool, {
      "https://ann.com/": HOME,
      "https://ann.com/services": SERVICES,
      "https://bob.com/": ABOUT,
    });
    const ann = await b.seedLead("ann");
    await b.queue.deliver(ann.job);
    const bob = await b.seedLead("bob");
    await b.queue.deliver(bob.job);
    const bobBefore = await leadPageRows(db, bob.lead.leadId);

    const updatedHome = "<html><body>New home</body></html>";
    b.fetcher.pages = { "https://ann.com/": updatedHome };
    const secondRun = await insertRun(db, {
      campaignId: b.campaign.campaignId,
      step: "prep",
      total: 1,
    });
    await b.queue.deliver({ ...ann.job, runId: secondRun.runId });

    expect(await leadPageRows(db, ann.lead.leadId)).toEqual([
      { path: "/", url: "https://ann.com/", html: updatedHome },
    ]);
    expect(await leadPageRows(db, bob.lead.leadId)).toEqual(bobBefore);
  });
});

test("a duplicate delivery and a late failure keep the saved pages and progress", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const b = await boot(db, pool, { "https://ann.com/": HOME });
    const { lead, job } = await b.seedLead("ann");

    await b.queue.deliver(job);
    const runs = await runRows(db);
    const items = await db.select().from(pipelineItemsTable);
    b.fetcher.error = new Error("late outage");
    await b.queue.deliver(job, { isFinalAttempt: true });

    expect(await runRows(db)).toEqual(runs);
    expect(await db.select().from(pipelineItemsTable)).toEqual(items);
    expect(await leadPageRows(db, lead.leadId)).toEqual([
      { path: "/", url: "https://ann.com/", html: HOME },
    ]);
    expect(b.fetcher.requested).toHaveLength(3);
  });
});

test("a fetch failure saves nothing, a final failure is counted, and a successful retry corrects the counters", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const b = await boot(db, pool, { "https://ann.com/": HOME });
    const { lead, run, job } = await b.seedLead("ann");
    b.fetcher.error = new Error("fetch failed");

    await expect(b.queue.deliver(job)).rejects.toThrow("fetch failed");

    expect(await leadPageRows(db, lead.leadId)).toEqual([]);
    expect((await b.storedLead(lead.leadId))?.pagesFetchedAt).toBeNull();
    expect(await db.select().from(pipelineItemsTable)).toEqual([]);
    expect(await runRows(db)).toMatchObject([
      { runId: run.runId, status: "running", processed: 0, failed: 0 },
    ]);

    await expect(
      b.queue.deliver(job, { isFinalAttempt: true }),
    ).rejects.toThrow("fetch failed");

    expect(await leadPageRows(db, lead.leadId)).toEqual([]);
    expect((await b.storedLead(lead.leadId))?.pagesFetchedAt).toBeNull();
    expect(await db.select().from(pipelineItemsTable)).toMatchObject([
      { status: "failed", error: "fetch failed" },
    ]);
    expect(await runRows(db)).toMatchObject([
      { runId: run.runId, status: "done", processed: 0, failed: 1 },
    ]);

    b.fetcher.error = undefined;
    await b.queue.deliver(job);

    expect(await leadPageRows(db, lead.leadId)).toEqual([
      { path: "/", url: "https://ann.com/", html: HOME },
    ]);
    expect(await db.select().from(pipelineItemsTable)).toMatchObject([
      { leadId: lead.leadId, status: "processed", error: null },
    ]);
    expect(await runRows(db)).toMatchObject([
      { runId: run.runId, status: "done", processed: 1, failed: 0 },
    ]);
  });
});

test("deleting a lead deletes its saved pages", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const b = await boot(db, pool, { "https://ann.com/": HOME });
    const { lead, job } = await b.seedLead("ann");
    await b.queue.deliver(job);
    expect(await leadPageRows(db, lead.leadId)).toHaveLength(1);

    await b.context.repositories.lead.removeByLeadId({ leadId: lead.leadId });

    expect(await db.select().from(leadPagesTable)).toEqual([]);
  });
});

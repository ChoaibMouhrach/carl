import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { initENV } from "@server/config/env";
import type { DB } from "@server/infrastructure/database/client";
import {
  pipelineItemsTable,
  type LeadInsert,
} from "@server/infrastructure/database/schemas";
import type { WebsiteJob } from "@server/lib/base-queue";
import { BaseWebPageFetcher } from "@server/lib/base-web-page-fetcher";
import {
  extractWebsiteEmails,
  websitePageUrls,
} from "@server/lib/extract-website-email";
import { WebsiteWorker } from "@server/workers/website";
import { createContext } from "./helpers/context";
import { withTestDatabase } from "./helpers/http";
import {
  ManualQueue,
  insertCampaign,
  insertRun,
  leadEmailRows,
  runRows,
} from "./helpers/pipeline";

type Pool = Parameters<typeof createContext>[1];

test("website page URLs preserve the supplied protocol, hostname and port and reset paths", () => {
  expect(
    websitePageUrls("http://www.coach.com:8080/about?from=skool#bio"),
  ).toEqual([
    "http://www.coach.com:8080/",
    "http://www.coach.com:8080/support",
    "http://www.coach.com:8080/contact",
  ]);
  expect(websitePageUrls("coach.com/about")).toEqual([
    "https://coach.com/",
    "https://coach.com/support",
    "https://coach.com/contact",
  ]);
  expect(websitePageUrls("http://")).toEqual([]);
  expect(websitePageUrls("ftp://coach.com")).toEqual([]);
});

const SKOOL = "https://www.skool.com";

class FakeWebPageFetcher extends BaseWebPageFetcher {
  public requested: string[] = [];
  public error?: Error;

  public constructor(private readonly pages: Record<string, string> = {}) {
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
  const queue = new ManualQueue<WebsiteJob>();
  const fetcher = new FakeWebPageFetcher(pages);
  context.queueHub.website = queue;
  context.webPageFetcher = fetcher;
  await new WebsiteWorker({ context }).run();

  return { context, queue, fetcher };
};

const seedLead = async (
  context: ReturnType<typeof createContext>,
  db: DB,
  values: Partial<LeadInsert> = {},
) => {
  const campaign = await insertCampaign(db);
  const run = await insertRun(db, {
    campaignId: campaign.campaignId,
    step: "website",
    total: 1,
  });
  const lead = await context.repositories.lead.create({
    name: "Ann Coach",
    username: "anncoach",
    skoolUrl: `${SKOOL}/@anncoach`,
    website: "https://anncoach.com",
    ...values,
  });
  const job: WebsiteJob = {
    type: "website-lead",
    runId: run.runId,
    leadId: lead.leadId,
  };

  return { run, lead, job };
};

test("a lead's home, support and contact pages are fetched and every email on them is added, keeping the ones it had", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, queue, fetcher } = await boot(db, pool, {
      "https://anncoach.com/": '<a href="mailto:hello@anncoach.com">Hi</a>',
      "https://anncoach.com/support": "Write to help@anncoach.com",
      "https://anncoach.com/contact":
        "hello@anncoach.com or ann.coach@gmail.com",
    });
    const { lead, run, job } = await seedLead(context, db);
    await context.repositories.leadEmail.addMany({
      leadId: lead.leadId,
      addresses: ["old@example.com"],
      source: "skool",
    });

    await queue.deliver(job);

    expect(fetcher.requested).toEqual([
      "https://anncoach.com/",
      "https://anncoach.com/support",
      "https://anncoach.com/contact",
    ]);
    expect(await leadEmailRows(db, lead.leadId)).toEqual([
      { address: "old@example.com", source: "skool" },
      { address: "hello@anncoach.com", source: "website" },
      { address: "help@anncoach.com", source: "website" },
      { address: "ann.coach@gmail.com", source: "website" },
    ]);
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

test("a link-in-bio page stores its real address and none of its social profile links", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, queue } = await boot(db, pool, {
      "https://linktr.ee/": [
        '<a href="https://www.tiktok.com/@linktr.ee">TikTok</a>',
        '<a href="//www.threads.net/@linktr.ee">Threads</a>',
        '<a href="//tiktok.com/@linktr.ee">TikTok</a>',
        '<a href="mailto:press@linktr.ee">Press</a>',
      ].join(""),
    });
    const { lead, run, job } = await seedLead(context, db, {
      username: "jaymakeplay",
      skoolUrl: `${SKOOL}/@jaymakeplay`,
      website: "https://linktr.ee/jaymakeplay",
    });

    await queue.deliver(job);

    expect(await leadEmailRows(db, lead.leadId)).toEqual([
      { address: "press@linktr.ee", source: "website" },
    ]);
    expect(await runRows(db)).toMatchObject([
      { runId: run.runId, status: "done", processed: 1, failed: 0 },
    ]);
  });
});

test("scraping the same site again adds no duplicate email", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, queue } = await boot(db, pool, {
      "https://anncoach.com/": "hello@anncoach.com",
    });
    const { lead, job } = await seedLead(context, db);
    await queue.deliver(job);
    const secondRun = await insertRun(db, {
      campaignId: (await runRows(db))[0]!.campaignId,
      step: "website",
      total: 1,
    });

    await queue.deliver({ ...job, runId: secondRun.runId });

    expect(await leadEmailRows(db, lead.leadId)).toEqual([
      { address: "hello@anncoach.com", source: "website" },
    ]);
  });
});

test("a lead without a website is finished without fetching anything", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, queue, fetcher } = await boot(db, pool);
    const { lead, run, job } = await seedLead(context, db, { website: null });

    await queue.deliver(job);

    expect(fetcher.requested).toEqual([]);
    expect(await leadEmailRows(db, lead.leadId)).toEqual([]);
    expect(await runRows(db)).toMatchObject([
      { runId: run.runId, status: "done", processed: 1 },
    ]);
  });
});

test("pages that cannot be fetched leave the lead finished with no new emails", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, queue, fetcher } = await boot(db, pool);
    const { lead, run, job } = await seedLead(context, db);

    await queue.deliver(job);

    expect(fetcher.requested).toHaveLength(3);
    expect(await leadEmailRows(db, lead.leadId)).toEqual([]);
    expect(await runRows(db)).toMatchObject([
      { runId: run.runId, status: "done", processed: 1, failed: 0 },
    ]);
  });
});

test("duplicate website deliveries and late failures preserve the successful emails and progress", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, queue, fetcher } = await boot(db, pool, {
      "https://anncoach.com/": "hello@anncoach.com",
    });
    const { lead, job } = await seedLead(context, db);

    await queue.deliver(job);
    const runs = await runRows(db);
    const items = await db.select().from(pipelineItemsTable);
    fetcher.error = new Error("late outage");
    await queue.deliver(job, { isFinalAttempt: true });

    expect(await runRows(db)).toEqual(runs);
    expect(await db.select().from(pipelineItemsTable)).toEqual(items);
    expect(await leadEmailRows(db, lead.leadId)).toEqual([
      { address: "hello@anncoach.com", source: "website" },
    ]);
    expect(fetcher.requested).toHaveLength(3);
  });
});

test("website failures leave no partial emails and a successful retry corrects final failure counters", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, queue, fetcher } = await boot(db, pool, {
      "https://anncoach.com/": "hello@anncoach.com",
    });
    const { lead, run, job } = await seedLead(context, db);
    fetcher.error = new Error("fetch failed");

    await expect(queue.deliver(job)).rejects.toThrow("fetch failed");

    expect(await leadEmailRows(db, lead.leadId)).toEqual([]);
    expect(await db.select().from(pipelineItemsTable)).toEqual([]);
    expect(await runRows(db)).toMatchObject([
      { runId: run.runId, status: "running", processed: 0, failed: 0 },
    ]);

    await expect(queue.deliver(job, { isFinalAttempt: true })).rejects.toThrow(
      "fetch failed",
    );

    expect(await leadEmailRows(db, lead.leadId)).toEqual([]);
    expect(await db.select().from(pipelineItemsTable)).toMatchObject([
      { status: "failed", error: "fetch failed" },
    ]);
    expect(await runRows(db)).toMatchObject([
      { runId: run.runId, status: "done", processed: 0, failed: 1 },
    ]);

    fetcher.error = undefined;
    await queue.deliver(job);

    expect(await leadEmailRows(db, lead.leadId)).toEqual([
      { address: "hello@anncoach.com", source: "website" },
    ]);
    expect(await db.select().from(pipelineItemsTable)).toMatchObject([
      { leadId: lead.leadId, status: "processed", error: null },
    ]);
    expect(await runRows(db)).toMatchObject([
      { runId: run.runId, status: "done", processed: 1, failed: 0 },
    ]);
  });
});

const extractionCases: {
  name: string;
  pages: string[];
  website: string;
  expected: string[];
}[] = [
  {
    name: "addresses on the lead's own domain come before webmail ones",
    pages: ["ann@gmail.com hello@anncoach.com"],
    website: "https://anncoach.com",
    expected: ["hello@anncoach.com", "ann@gmail.com"],
  },
  {
    name: "a www website still matches its bare domain, and subdomains count",
    pages: ["a@mail.anncoach.com b@anncoach.com"],
    website: "https://www.anncoach.com",
    expected: ["a@mail.anncoach.com", "b@anncoach.com"],
  },
  {
    name: "other companies' addresses, template placeholders and image names are ignored",
    pages: [
      "vendor@somebody-else.com logo@2x.png noreply@anncoach.com you@example.com",
    ],
    website: "https://anncoach.com",
    expected: [],
  },
  {
    name: "the same address in different cases is listed once",
    pages: ["Hello@AnnCoach.com", "hello@anncoach.com"],
    website: "anncoach.com",
    expected: ["hello@anncoach.com"],
  },
  {
    name: "social profile URLs such as tiktok.com/@linktr.ee are not mistaken for addresses",
    pages: [
      '<a href="https://www.tiktok.com/@linktr.ee"></a> <a href="//www.threads.net/@linktr.ee"></a> press@linktr.ee',
    ],
    website: "https://linktr.ee/jaymakeplay",
    expected: ["press@linktr.ee"],
  },
  {
    name: "an unparseable website yields nothing",
    pages: ["hello@anncoach.com"],
    website: "http://",
    expected: [],
  },
];

for (const scenario of extractionCases) {
  test(`extraction: ${scenario.name}`, () => {
    expect(extractWebsiteEmails(scenario.pages, scenario.website)).toEqual(
      scenario.expected,
    );
  });
}

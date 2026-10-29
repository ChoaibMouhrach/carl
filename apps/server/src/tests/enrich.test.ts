import { PipelineProgressService } from "@server/services/pipeline-progress";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import z from "zod";
import { initENV } from "@server/config/env";
import type { DB } from "@server/infrastructure/database/client";
import {
  leadsTable,
  pipelineRunsTable,
  pipelineItemsTable,
  type LeadInsert,
} from "@server/infrastructure/database/schemas";
import { NonRetryableJobError, type EnrichJob } from "@server/lib/base-queue";
import {
  WebSearchError,
  type WebSearchResult,
} from "@server/lib/base-web-search";
import { EnrichWorker } from "@server/workers/enrich";
import { createContext } from "./helpers/context";
import { withTestDatabase } from "./helpers/http";
import {
  FakeWebSearch,
  ManualQueue,
  insertCampaign,
  insertRun,
} from "./helpers/pipeline";

type Pool = Parameters<typeof createContext>[1];

const SKOOL = "https://www.skool.com";

const result = (url: string, content: string, title = ""): WebSearchResult => ({
  title,
  url,
  content,
});

const boot = async (
  db: DB,
  pool: Pool,
  respond?: (query: string) => WebSearchResult[],
) => {
  const context = createContext(db, pool, initENV());
  const queue = new ManualQueue<EnrichJob>();
  const webSearch = new FakeWebSearch(respond);
  context.queueHub.enrich = queue;
  context.webSearch = webSearch;
  await new EnrichWorker({ context }).run();

  return { context, queue, webSearch };
};

const seedLead = async (
  context: ReturnType<typeof createContext>,
  db: DB,
  values: Partial<LeadInsert> = {},
  communityName = "Ann's place",
) => {
  const campaign = await insertCampaign(db);
  const run = await insertRun(db, {
    campaignId: campaign.campaignId,
    step: "enrich",
    total: 1,
  });
  const lead = await context.repositories.lead.create({
    name: "Ann Coach",
    username: "anncoach",
    skoolUrl: `${SKOOL}/@anncoach`,
    ...values,
  });
  await context.repositories.community.create({
    leadId: lead.leadId,
    name: communityName,
    skoolUrl: `${SKOOL}/${communityName.toLowerCase().replaceAll(/\W+/g, "-")}`,
    isFree: true,
  });
  await context.repositories.campaign.addLeads({
    campaignId: campaign.campaignId,
    leadIds: [lead.leadId],
  });

  return { campaign, run, lead, job: enrichJob(run.runId, lead.leadId) };
};

const enrichJob = (runId: number, leadId: number): EnrichJob => ({
  type: "enrich-lead",
  runId,
  leadId,
});

const leadRow = async (db: DB, leadId: number) => {
  const [row] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.leadId, leadId));

  if (!row) {
    throw new Error(`Lead ${leadId} is missing.`);
  }

  return row;
};

const runRow = async (db: DB, runId: number) => {
  const [row] = await db
    .select()
    .from(pipelineRunsTable)
    .where(eq(pipelineRunsTable.runId, runId));

  if (!row) {
    throw new Error(`Run ${runId} is missing.`);
  }

  return row;
};

test("enriching a lead searches by name and community, then stores the website, LinkedIn profile and email it found", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, queue, webSearch } = await boot(db, pool, () => [
      result(
        "https://www.linkedin.com/in/anncoach?trk=search",
        "Ann Coach - Fitness coach",
      ),
      result("https://anncoach.com/about", "Ann Coach helps people train."),
      result(
        "https://directory.example.com/ann",
        "Ann Coach, reach out at ann@anncoach.com",
      ),
    ]);
    const { lead, run, job } = await seedLead(context, db);

    await queue.deliver(job);

    expect(webSearch.queries).toHaveLength(1);
    expect(webSearch.queries[0]).toContain("Ann Coach");
    expect(webSearch.queries[0]).toContain("Ann's place");
    const stored = await leadRow(db, lead.leadId);
    expect(stored.website).toBe("https://anncoach.com");
    expect(stored.linkedin).toBe("https://www.linkedin.com/in/anncoach");
    expect(stored.email).toBe("ann@anncoach.com");
    expect(stored.enrichedAt).toBeInstanceOf(Date);
    expect(await runRow(db, run.runId)).toMatchObject({
      status: "done",
      total: 1,
      processed: 1,
      failed: 0,
    });
  });
});

test("enrichment never overwrites a contact detail the lead already has", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, queue } = await boot(db, pool, () => [
      result(
        "https://www.linkedin.com/in/someone-else",
        "Ann Coach ann@new.example.com",
      ),
      result("https://new.example.com/", "Ann Coach"),
    ]);
    const { lead, job } = await seedLead(context, db, {
      website: "https://old.example.com",
      linkedin: "https://www.linkedin.com/in/old",
      email: "old@example.com",
    });

    await queue.deliver(job);

    const stored = await leadRow(db, lead.leadId);
    expect(stored.website).toBe("https://old.example.com");
    expect(stored.linkedin).toBe("https://www.linkedin.com/in/old");
    expect(stored.email).toBe("old@example.com");
    expect(stored.enrichedAt).toBeInstanceOf(Date);
  });
});

test("results that never mention the lead are ignored, yet the lead counts as enriched", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, queue } = await boot(db, pool, () => [
      result("https://stranger.example.com", "Bob Other bob@other.example.com"),
      result("https://www.linkedin.com/in/bob", "Bob Other"),
    ]);
    const { lead, run, job } = await seedLead(context, db);

    await queue.deliver(job);

    const stored = await leadRow(db, lead.leadId);
    expect(stored.website).toBeNull();
    expect(stored.linkedin).toBeNull();
    expect(stored.email).toBeNull();
    expect(stored.enrichedAt).toBeInstanceOf(Date);
    expect((await runRow(db, run.runId)).processed).toBe(1);
  });
});

test("a search with no results still finishes the lead without contact details", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, queue } = await boot(db, pool, () => []);
    const { lead, run, job } = await seedLead(context, db);

    await queue.deliver(job);

    const stored = await leadRow(db, lead.leadId);
    expect(stored).toMatchObject({
      website: null,
      linkedin: null,
      email: null,
    });
    expect(stored.enrichedAt).toBeInstanceOf(Date);
    expect(await runRow(db, run.runId)).toMatchObject({
      status: "done",
      processed: 1,
    });
  });
});

const extractionCases: {
  name: string;
  results: WebSearchResult[];
  expected: {
    website: string | null;
    linkedin: string | null;
    email: string | null;
  };
}[] = [
  {
    name: "social and encyclopedia hosts never become the website",
    results: [
      result("https://x.com/anncoach", "Ann Coach"),
      result("https://www.youtube.com/@ann", "Ann Coach"),
      result("https://www.skool.com/@anncoach", "Ann Coach"),
    ],
    expected: { website: null, linkedin: null, email: null },
  },
  {
    name: "a subdomain of a blocked host is not a personal site",
    results: [result("https://blog.medium.com/ann", "Ann Coach")],
    expected: { website: null, linkedin: null, email: null },
  },
  {
    name: "a host that only ends like a blocked one is a personal site",
    results: [result("https://notx.com/ann", "Ann Coach")],
    expected: { website: "https://notx.com", linkedin: null, email: null },
  },
  {
    name: "a LinkedIn company page is not a profile",
    results: [result("https://www.linkedin.com/company/ann", "Ann Coach")],
    expected: { website: null, linkedin: null, email: null },
  },
  {
    name: "a localized LinkedIn profile is kept as found",
    results: [result("https://uk.linkedin.com/in/ann-coach", "Ann Coach")],
    expected: {
      website: null,
      linkedin: "https://uk.linkedin.com/in/ann-coach",
      email: null,
    },
  },
  {
    name: "generic mailboxes are skipped in favour of a personal address",
    results: [
      result(
        "https://anncoach.com",
        "Ann Coach support@anncoach.com noreply@anncoach.com ann@anncoach.com",
      ),
    ],
    expected: {
      website: "https://anncoach.com",
      linkedin: null,
      email: "ann@anncoach.com",
    },
  },
  {
    name: "only generic mailboxes leaves the email empty",
    results: [result("https://x.com/a", "Ann Coach privacy@anncoach.com")],
    expected: { website: null, linkedin: null, email: null },
  },
  {
    name: "the name is matched case-insensitively in the title",
    results: [result("https://anncoach.com/page", "", "ANN COACH - home")],
    expected: { website: "https://anncoach.com", linkedin: null, email: null },
  },
  {
    name: "a malformed result URL is ignored without failing the lead",
    results: [result("not a url", "Ann Coach ann@anncoach.com")],
    expected: { website: null, linkedin: null, email: "ann@anncoach.com" },
  },
];

for (const scenario of extractionCases) {
  test(`extraction: ${scenario.name}`, async () => {
    await withTestDatabase(async ({ db, pool }) => {
      const { context, queue } = await boot(db, pool, () => scenario.results);
      const { lead, run, job } = await seedLead(context, db);

      await queue.deliver(job);

      const stored = await leadRow(db, lead.leadId);
      expect({
        website: stored.website,
        linkedin: stored.linkedin,
        email: stored.email,
      }).toEqual(scenario.expected);
      expect(await runRow(db, run.runId)).toMatchObject({
        processed: 1,
        failed: 0,
      });
    });
  });
}

test("a lead with an empty name does not collect a stranger's details", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, queue } = await boot(db, pool, () => [
      result("https://stranger.example.com", "Totally unrelated stranger@x.io"),
    ]);
    const { lead, job } = await seedLead(context, db, { name: "" });

    await queue.deliver(job);

    const stored = await leadRow(db, lead.leadId);
    expect(stored.website).toBeNull();
    expect(stored.email).toBeNull();
  });
});

test("a lead deleted before its job runs is counted as processed and the run still finishes", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, queue, webSearch } = await boot(db, pool);
    const { lead, run, job } = await seedLead(context, db);
    await db.delete(leadsTable).where(eq(leadsTable.leadId, lead.leadId));

    await queue.deliver(job);

    expect(webSearch.queries).toHaveLength(0);
    expect(await runRow(db, run.runId)).toMatchObject({
      status: "done",
      processed: 1,
      failed: 0,
    });
  });
});

const failureCases: {
  name: string;
  error: () => unknown;
  isFinalAttempt: boolean;
  expectedError: new (...args: never[]) => Error;
  counted: boolean;
}[] = [
  {
    name: "a retryable search error is retried, not counted",
    error: () =>
      new WebSearchError({ message: "rate limited", retryable: true }),
    isFinalAttempt: false,
    expectedError: WebSearchError,
    counted: false,
  },
  {
    name: "a retryable search error on the final attempt is counted as failed",
    error: () =>
      new WebSearchError({ message: "rate limited", retryable: true }),
    isFinalAttempt: true,
    expectedError: WebSearchError,
    counted: true,
  },
  {
    name: "a non-retryable search error is counted as failed at once",
    error: () => new WebSearchError({ message: "bad key", retryable: false }),
    isFinalAttempt: false,
    expectedError: NonRetryableJobError,
    counted: true,
  },
  {
    name: "a validation error is counted as failed at once",
    error: () => z.number().safeParse("x").error,
    isFinalAttempt: false,
    expectedError: NonRetryableJobError,
    counted: true,
  },
];

for (const scenario of failureCases) {
  test(`failure: ${scenario.name}, and the lead stays untouched`, async () => {
    await withTestDatabase(async ({ db, pool }) => {
      const { context, queue } = await boot(db, pool, () => {
        throw scenario.error();
      });
      const { lead, run, job } = await seedLead(context, db);

      await expect(
        queue.deliver(job, { isFinalAttempt: scenario.isFinalAttempt }),
      ).rejects.toBeInstanceOf(scenario.expectedError);

      const stored = await leadRow(db, lead.leadId);
      expect(stored.enrichedAt).toBeNull();
      expect(stored.website).toBeNull();
      expect(await runRow(db, run.runId)).toMatchObject(
        scenario.counted
          ? { status: "done", processed: 0, failed: 1 }
          : { status: "running", processed: 0, failed: 0 },
      );
    });
  });
}

test("a run with processed and failed leads ends done, not failed, once every lead is accounted for", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, queue } = await boot(db, pool, (query) => {
      if (query.includes("Broken")) {
        throw new WebSearchError({ message: "bad key", retryable: false });
      }

      return [];
    });
    const campaign = await insertCampaign(db);
    const run = await insertRun(db, {
      campaignId: campaign.campaignId,
      step: "enrich",
      total: 3,
    });
    const leads = [];
    for (const name of ["Ann", "Broken", "Cat"]) {
      leads.push(
        await context.repositories.lead.create({
          name,
          username: name.toLowerCase(),
          skoolUrl: `${SKOOL}/@${name.toLowerCase()}`,
        }),
      );
    }

    for (const lead of leads) {
      await queue
        .deliver(enrichJob(run.runId, lead.leadId))
        .catch(() => undefined);
    }

    expect(await runRow(db, run.runId)).toMatchObject({
      status: "done",
      total: 3,
      processed: 2,
      failed: 1,
      error: null,
    });
    const enriched = await Promise.all(
      leads.map(async (lead) => (await leadRow(db, lead.leadId)).enrichedAt),
    );
    expect(enriched.map((value) => value !== null)).toEqual([
      true,
      false,
      true,
    ]);
  });
});

test("duplicate completions and late failures do not change a successful item", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, queue, webSearch } = await boot(db, pool);
    const { run, lead, job } = await seedLead(context, db);
    await queue.deliver(job);
    await queue.deliver(job);
    await new PipelineProgressService({ context }).complete({
      runId: run.runId,
      itemKey: `lead:${lead.leadId}`,
      status: "failed",
      error: "late failure",
    });
    expect(await runRow(db, run.runId)).toMatchObject({
      status: "done",
      processed: 1,
      failed: 0,
    });
    const items = await db
      .select()
      .from(pipelineItemsTable)
      .where(eq(pipelineItemsTable.runId, run.runId));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      status: "processed",
      leadId: lead.leadId,
      error: null,
    });
    expect(webSearch.queries).toHaveLength(1);
  });
});

test("retrying a failed item after the run finishes corrects its stored outcome and counters", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    let failing = true;
    const { context, queue } = await boot(db, pool, () => {
      if (failing)
        throw new WebSearchError({ message: "temporary", retryable: true });
      return [result("https://anncoach.com", "Ann Coach helps people train.")];
    });
    const { run, lead, job } = await seedLead(context, db);
    await expect(queue.deliver(job, { isFinalAttempt: true })).rejects.toThrow(
      "temporary",
    );
    expect(await runRow(db, run.runId)).toMatchObject({
      status: "done",
      processed: 0,
      failed: 1,
    });
    failing = false;
    await queue.deliver(job);
    await queue.deliver(job);
    expect(await runRow(db, run.runId)).toMatchObject({
      status: "done",
      processed: 1,
      failed: 0,
    });
    const items = await db
      .select()
      .from(pipelineItemsTable)
      .where(eq(pipelineItemsTable.runId, run.runId));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      status: "processed",
      leadId: lead.leadId,
      website: "https://anncoach.com",
      error: null,
    });
    expect((await leadRow(db, lead.leadId)).website).toBe(
      "https://anncoach.com",
    );
  });
});

test("concurrent and repeated item completions never lose counts or finish a run early", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context } = await boot(db, pool);
    const campaign = await insertCampaign(db);
    const run = await insertRun(db, {
      campaignId: campaign.campaignId,
      step: "enrich",
      total: 20,
    });
    const progress = new PipelineProgressService({ context });
    await Promise.all(
      Array.from({ length: 19 }, (_, index) =>
        progress.complete({
          runId: run.runId,
          itemKey: `lead:${index}`,
          status: index % 4 === 0 ? "failed" : "processed",
        }),
      ),
    );
    expect(await runRow(db, run.runId)).toMatchObject({
      status: "running",
      processed: 14,
      failed: 5,
    });
    await Promise.all(
      Array.from({ length: 10 }, () =>
        progress.complete({
          runId: run.runId,
          itemKey: "lead:last",
          status: "processed",
        }),
      ),
    );
    expect(await runRow(db, run.runId)).toMatchObject({
      status: "done",
      processed: 15,
      failed: 5,
    });
    const items = await db
      .select()
      .from(pipelineItemsTable)
      .where(eq(pipelineItemsTable.runId, run.runId));
    expect(items).toHaveLength(20);
  });
});

test("a failed result transaction rolls back both lead changes and progress", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context } = await boot(db, pool);
    const { lead, run } = await seedLead(context, db);
    const progress = new PipelineProgressService({ context });
    await expect(
      progress.complete(
        {
          runId: run.runId,
          itemKey: `lead:${lead.leadId}`,
          status: "processed",
        },
        async (tx) => {
          await tx.lead.update(
            { leadId: lead.leadId },
            { website: "https://rollback.example.com" },
          );
          throw new Error("result persistence failed");
        },
      ),
    ).rejects.toThrow("result persistence failed");
    expect((await leadRow(db, lead.leadId)).website).toBeNull();
    expect(await runRow(db, run.runId)).toMatchObject({
      status: "running",
      processed: 0,
      failed: 0,
    });
    const items = await db
      .select()
      .from(pipelineItemsTable)
      .where(eq(pipelineItemsTable.runId, run.runId));
    expect(items).toEqual([]);
  });
});

import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { initENV } from "@server/config/env";
import type { DB } from "@server/infrastructure/database/client";
import {
  pipelineItemsTable,
  type LeadInsert,
} from "@server/infrastructure/database/schemas";
import type {
  EnrichJob,
  FullEnrichJob,
  WebsiteJob,
} from "@server/lib/base-queue";
import { BaseWebPageFetcher } from "@server/lib/base-web-page-fetcher";
import type { WebSearchResult } from "@server/lib/base-web-search";
import type { ContactEnrichmentInput } from "@server/lib/base-contact-enrichment";
import { EnrichWorker } from "@server/workers/enrich";
import { FullEnrichWorker } from "@server/workers/fullenrich";
import { WebsiteWorker } from "@server/workers/website";
import { createAdminClient } from "./helpers/api";
import { createContext } from "./helpers/context";
import { withTestDatabase } from "./helpers/http";
import {
  FakeContactEnrichment,
  FakeWebSearch,
  ManualQueue,
  insertCampaign,
  leadEmailRows,
  runRows,
} from "./helpers/pipeline";

type Pool = Parameters<typeof createContext>[1];

const SKOOL = "https://www.skool.com";
const past = new Date("2026-01-01T00:00:00Z");

class FakePages extends BaseWebPageFetcher {
  public constructor(private readonly pages: Record<string, string>) {
    super();
  }

  public override async fetchHtml(url: string): Promise<string | null> {
    return this.pages[url] ?? null;
  }
}

interface BootOptions {
  workEmails?: Record<string, string>;
  searchResults?: Record<string, WebSearchResult[]>;
  pages?: Record<string, string>;
}

const boot = async (db: DB, pool: Pool, options: BootOptions = {}) => {
  const context = createContext(db, pool, initENV());
  const provider = new FakeContactEnrichment((input) => {
    const address = options.workEmails?.[input.firstName];
    return {
      workEmail: address ? { address, status: "valid" } : null,
      personalEmail: null,
    };
  });
  const search = new FakeWebSearch((query) =>
    Object.entries(options.searchResults ?? {}).flatMap(([name, results]) =>
      query.includes(`"${name}"`) ? results : [],
    ),
  );
  context.contactEnrichment = provider;
  context.webSearch = search;
  context.webPageFetcher = new FakePages(options.pages ?? {});
  const queues = {
    enrich: new ManualQueue<EnrichJob>(),
    website: new ManualQueue<WebsiteJob>(),
    fullenrich: new ManualQueue<FullEnrichJob>(),
  };
  context.queueHub.enrich = queues.enrich;
  context.queueHub.website = queues.website;
  context.queueHub.fullenrich = queues.fullenrich;
  await new EnrichWorker({ context }).run();
  await new WebsiteWorker({ context }).run();
  await new FullEnrichWorker({ context }).run();
  const admin = await createAdminClient(context, "spend@example.com");
  const campaign = await insertCampaign(db);
  const delivered = new Map<object, number>();

  const drain = async <Job>(queue: ManualQueue<Job>) => {
    let next = delivered.get(queue) ?? 0;
    while (next < queue.added.length) {
      const job = queue.added[next];
      next += 1;
      delivered.set(queue, next);
      if (job) await queue.deliver(job);
    }
  };

  const start = async (
    step: "enrich" | "website" | "fullenrich",
    includeProcessed = false,
  ) =>
    await admin.post(`/api/campaigns/${campaign.campaignId}/pipeline/${step}`, {
      includeProcessed,
    });

  const addLead = async (
    username: string,
    values: Partial<LeadInsert> = {},
    emails: { address: string; source: "website" | "manual" }[] = [],
  ) => {
    const lead = await context.repositories.lead.create({
      name: username,
      username: username.toLowerCase().replaceAll(" ", "-"),
      skoolUrl: `${SKOOL}/@${username.toLowerCase().replaceAll(" ", "-")}`,
      ...values,
    });
    await context.repositories.campaign.addLeads({
      campaignId: campaign.campaignId,
      leadIds: [lead.leadId],
    });
    for (const email of emails) {
      await context.repositories.leadEmail.addMany({
        leadId: lead.leadId,
        addresses: [email.address],
        source: email.source,
      });
    }
    return lead;
  };

  const lead = async (leadId: number) => {
    const stored = await context.repositories.lead.findByLeadId({ leadId });
    if (!stored) throw new Error(`Missing lead ${leadId}`);
    return stored;
  };

  const runsOf = async (step: string) =>
    (await runRows(db)).filter((run) => run.step === step);

  return {
    context,
    provider,
    search,
    queues,
    drain,
    start,
    addLead,
    lead,
    runsOf,
    campaign,
  };
};

const firstNames = (inputs: ContactEnrichmentInput[]) =>
  inputs.map((input) => input.firstName).toSorted();

test("FullEnrich calls the paid provider only for leads that are contactable, have no email and were never looked up", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const b = await boot(db, pool, {
      workEmails: { Ann: "ann@alpha.example.com" },
    });
    const ann = await b.addLead("Ann", {
      website: "https://alpha.example.com",
    });
    const bob = await b.addLead("Bob", {
      linkedin: "https://linkedin.com/in/bob",
    });
    const cat = await b.addLead(
      "Cat",
      { website: "https://gamma.example.com" },
      [{ address: "hi@gamma.example.com", source: "website" }],
    );
    const dan = await b.addLead("Dan");
    const eve = await b.addLead("Eve", {
      website: "https://echo.example.com",
      emailEnrichedAt: past,
    });

    const response = await b.start("fullenrich");
    await b.drain(b.queues.fullenrich);

    expect(response.status).toBe(202);
    expect(firstNames(b.provider.inputs)).toEqual(["Ann", "Bob"]);
    expect(
      b.provider.inputs.find((input) => input.firstName === "Ann"),
    ).toMatchObject({
      domain: "alpha.example.com",
    });
    expect(await leadEmailRows(db, ann.leadId)).toEqual([
      { address: "ann@alpha.example.com", source: "fullenrich-work" },
    ]);
    expect((await b.lead(ann.leadId)).emailEnrichedAt).toBeInstanceOf(Date);
    expect(await leadEmailRows(db, bob.leadId)).toEqual([]);
    expect((await b.lead(bob.leadId)).emailEnrichedAt).toBeInstanceOf(Date);
    expect(await leadEmailRows(db, cat.leadId)).toEqual([
      { address: "hi@gamma.example.com", source: "website" },
    ]);
    expect((await b.lead(cat.leadId)).emailEnrichedAt).toBeNull();
    expect((await b.lead(dan.leadId)).emailEnrichedAt).toBeNull();
    expect((await b.lead(eve.leadId)).emailEnrichedAt).toEqual(past);
    expect(await b.runsOf("fullenrich")).toMatchObject([
      { status: "done", total: 2, processed: 2, failed: 0 },
    ]);
  });
});

test("running FullEnrich again pays for nothing, and including tried leads pays only for those still without an email", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const b = await boot(db, pool, {
      workEmails: { Ann: "ann@alpha.example.com" },
    });
    const ann = await b.addLead("Ann", {
      website: "https://alpha.example.com",
    });
    await b.addLead("Bob", { linkedin: "https://linkedin.com/in/bob" });
    await b.addLead("Eve", {
      website: "https://echo.example.com",
      emailEnrichedAt: past,
    });
    await b.start("fullenrich");
    await b.drain(b.queues.fullenrich);
    expect(b.provider.inputs).toHaveLength(2);

    const again = await b.start("fullenrich");
    await b.drain(b.queues.fullenrich);

    expect(again.status).toBe(202);
    expect(b.provider.inputs).toHaveLength(2);
    expect(await b.runsOf("fullenrich")).toMatchObject([
      { total: 2, status: "done" },
      { total: 0, status: "done" },
    ]);
    expect(b.queues.fullenrich.added).toHaveLength(2);

    const forced = await b.start("fullenrich", true);
    await b.drain(b.queues.fullenrich);

    expect(forced.status).toBe(202);
    expect(firstNames(b.provider.inputs.slice(2))).toEqual(["Bob", "Eve"]);
    expect(
      b.provider.inputs.filter((input) => input.firstName === "Ann"),
    ).toHaveLength(1);
    expect(await leadEmailRows(db, ann.leadId)).toHaveLength(1);
  });
});

test("an email the website step found means FullEnrich never pays for that lead", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const b = await boot(db, pool, {
      pages: {
        "https://found.example.com/": "Write to hello@found.example.com",
      },
    });
    const found = await b.addLead("Found", {
      website: "https://found.example.com",
    });
    const silent = await b.addLead("Silent", {
      website: "https://silent.example.com",
    });

    await b.start("website");
    await b.drain(b.queues.website);
    const fullenrich = await b.start("fullenrich");
    await b.drain(b.queues.fullenrich);

    expect(fullenrich.status).toBe(202);
    expect(await leadEmailRows(db, found.leadId)).toEqual([
      { address: "hello@found.example.com", source: "website" },
    ]);
    expect((await b.lead(found.leadId)).websiteScrapedAt).toBeInstanceOf(Date);
    expect((await b.lead(found.leadId)).emailEnrichedAt).toBeNull();
    expect(await b.runsOf("fullenrich")).toMatchObject([{ total: 1 }]);
    expect(firstNames(b.provider.inputs)).toEqual(["Silent"]);
    expect((await b.lead(silent.leadId)).emailEnrichedAt).toBeInstanceOf(Date);
  });
});

test("an email that arrives after a lead was queued stops the paid lookup for it", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const b = await boot(db, pool);
    const lead = await b.addLead("Late", {
      website: "https://late.example.com",
    });
    await b.start("fullenrich");
    expect(b.queues.fullenrich.added).toHaveLength(1);

    await b.context.repositories.leadEmail.addMany({
      leadId: lead.leadId,
      addresses: ["hello@late.example.com"],
      source: "website",
    });
    await b.drain(b.queues.fullenrich);

    expect(b.provider.inputs).toEqual([]);
    expect(await leadEmailRows(db, lead.leadId)).toEqual([
      { address: "hello@late.example.com", source: "website" },
    ]);
    expect((await b.lead(lead.leadId)).emailEnrichedAt).toBeNull();
    const [run] = await b.runsOf("fullenrich");
    expect(run).toMatchObject({ status: "done", total: 1, processed: 1 });
    const items = await db
      .select()
      .from(pipelineItemsTable)
      .where(eq(pipelineItemsTable.runId, run?.runId ?? -1));
    expect(items).toMatchObject([{ status: "processed" }]);
  });
});

test("two simultaneous starts make one run and queue each lead once", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const b = await boot(db, pool);
    await b.addLead("Ann", { website: "https://alpha.example.com" });
    await b.addLead("Bob", { linkedin: "https://linkedin.com/in/bob" });

    const responses = await Promise.all([
      b.start("fullenrich"),
      b.start("fullenrich"),
    ]);

    expect(responses.map((response) => response.status).toSorted()).toEqual([
      202, 409,
    ]);
    expect(await b.runsOf("fullenrich")).toHaveLength(1);
    expect(b.queues.fullenrich.added).toHaveLength(2);
    expect(
      new Set(b.queues.fullenrich.added.map((job) => job.leadId)).size,
    ).toBe(2);
  });
});

test("Tavily searches only leads without LinkedIn that were never researched, and a repeat searches nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const b = await boot(db, pool, {
      searchResults: {
        Ann: [
          {
            title: "Ann",
            url: "https://ann-coach.example.com",
            content: "Ann coaches. Contact Ann at the site.",
          },
        ],
      },
    });
    const ann = await b.addLead("Ann");
    const bob = await b.addLead("Bob");
    const cat = await b.addLead("Cat", {
      linkedin: "https://linkedin.com/in/cat",
    });

    await b.start("enrich");
    await b.drain(b.queues.enrich);

    expect(b.search.queries).toHaveLength(2);
    expect((await b.lead(ann.leadId)).website).toBe(
      "https://ann-coach.example.com",
    );
    expect((await b.lead(ann.leadId)).enrichedAt).toBeInstanceOf(Date);
    expect((await b.lead(bob.leadId)).enrichedAt).toBeInstanceOf(Date);
    expect((await b.lead(cat.leadId)).enrichedAt).toBeNull();

    const again = await b.start("enrich");
    await b.drain(b.queues.enrich);

    expect(again.status).toBe(202);
    expect(b.search.queries).toHaveLength(2);
    expect(await b.runsOf("enrich")).toMatchObject([
      { total: 2 },
      { total: 0, status: "done" },
    ]);

    const forced = await b.start("enrich", true);
    await b.drain(b.queues.enrich);

    expect(forced.status).toBe(202);
    expect(b.search.queries).toHaveLength(4);
    expect((await b.lead(cat.leadId)).enrichedAt).toBeNull();
  });
});

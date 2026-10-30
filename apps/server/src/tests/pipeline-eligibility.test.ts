import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import z from "zod";
import { initENV } from "@server/config/env";
import type { DB } from "@server/infrastructure/database/client";
import { pipelineItemsTable } from "@server/infrastructure/database/schemas";
import type {
  EnrichJob,
  FullEnrichJob,
  WebsiteJob,
} from "@server/lib/base-queue";
import { createAdminClient } from "./helpers/api";
import { createContext } from "./helpers/context";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";
import {
  FakeContactEnrichment,
  FakeWebSearch,
  ManualQueue,
  insertCampaign,
  runRows,
} from "./helpers/pipeline";

type Pool = Parameters<typeof createContext>[1];

const SKOOL = "https://www.skool.com";

const stepPath = (campaignId: number, step: string) =>
  `/api/campaigns/${campaignId}/pipeline/${step}`;
const statusPath = (campaignId: number) =>
  `/api/campaigns/${campaignId}/pipeline`;

const counts = z.object({
  enrich: z.number(),
  website: z.number(),
  fullenrich: z.number(),
});

const statusSchema = z.object({
  funnel: z.object({
    scraped: z.number(),
    researched: z.number(),
    contactable: z.number(),
    withEmail: z.number(),
    needsEmail: z.number(),
    eligible: counts,
    eligibleWithProcessed: counts,
  }),
});

const leadListSchema = z.object({
  leads: z.array(z.object({ leadId: z.number(), username: z.string() })),
  meta: z.object({ total: z.number() }),
});

const boot = async (db: DB, pool: Pool) => {
  const context = createContext(db, pool, initENV());
  context.webSearch = new FakeWebSearch();
  context.contactEnrichment = new FakeContactEnrichment();
  const queues = {
    enrich: new ManualQueue<EnrichJob>(),
    website: new ManualQueue<WebsiteJob>(),
    fullenrich: new ManualQueue<FullEnrichJob>(),
  };
  context.queueHub.enrich = queues.enrich;
  context.queueHub.website = queues.website;
  context.queueHub.fullenrich = queues.fullenrich;
  const admin = await createAdminClient(context, "eligibility@example.com");
  const campaign = await insertCampaign(db);

  return { context, admin, queues, campaign };
};

type Booted = Awaited<ReturnType<typeof boot>>;

const past = new Date("2026-01-01T00:00:00Z");

interface LeadSpec {
  username: string;
  website?: string;
  linkedin?: string;
  enrichedAt?: Date;
  websiteScrapedAt?: Date;
  emailEnrichedAt?: Date;
  email?: "website" | "fullenrich-work";
  inCampaign?: boolean;
}

const specs: LeadSpec[] = [
  { username: "plain" },
  { username: "researched-empty", enrichedAt: past },
  { username: "site", website: "https://site.example.com" },
  {
    username: "site-scraped",
    website: "https://scraped.example.com",
    websiteScrapedAt: past,
  },
  {
    username: "site-emailed",
    website: "https://emailed.example.com",
    email: "website",
  },
  { username: "inbox", linkedin: "https://linkedin.com/in/inbox" },
  {
    username: "inbox-looked",
    linkedin: "https://linkedin.com/in/looked",
    emailEnrichedAt: past,
  },
  {
    username: "inbox-emailed",
    linkedin: "https://linkedin.com/in/emailed",
    email: "fullenrich-work",
  },
  {
    username: "outsider",
    website: "https://outsider.example.com",
    inCampaign: false,
  },
];

const seed = async ({ context, campaign }: Booted) => {
  const ids = new Map<string, number>();

  for (const spec of specs) {
    const lead = await context.repositories.lead.create({
      name: spec.username,
      username: spec.username,
      skoolUrl: `${SKOOL}/@${spec.username}`,
      website: spec.website,
      linkedin: spec.linkedin,
      enrichedAt: spec.enrichedAt,
      websiteScrapedAt: spec.websiteScrapedAt,
      emailEnrichedAt: spec.emailEnrichedAt,
    });
    ids.set(spec.username, lead.leadId);

    if (spec.inCampaign !== false) {
      await context.repositories.campaign.addLeads({
        campaignId: campaign.campaignId,
        leadIds: [lead.leadId],
      });
    }

    if (spec.email) {
      await context.repositories.leadEmail.addMany({
        leadId: lead.leadId,
        addresses: [`${spec.username}@example.com`],
        source: spec.email,
      });
    }
  }

  const idsOf = (...usernames: string[]) =>
    usernames
      .map((username) => {
        const leadId = ids.get(username);
        if (leadId === undefined) throw new Error(`Unknown lead ${username}`);
        return leadId;
      })
      .toSorted((a, b) => a - b);

  return { idsOf };
};

const sorted = (values: number[]) => values.toSorted((a, b) => a - b);

test("the funnel counts campaign leads by what they have, and each step's eligible leads with and without already-tried ones", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const booted = await boot(db, pool);
    await seed(booted);

    const response = await booted.admin.get(
      statusPath(booted.campaign.campaignId),
    );

    expect(response.status).toBe(200);
    const { funnel } = statusSchema.parse(await response.json());
    expect(funnel).toEqual({
      scraped: 8,
      researched: 4,
      contactable: 6,
      withEmail: 2,
      needsEmail: 4,
      eligible: { enrich: 4, website: 1, fullenrich: 3 },
      eligibleWithProcessed: { enrich: 5, website: 2, fullenrich: 4 },
    });
  });
});

test("the funnel of a campaign without leads is all zeros", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, campaign } = await boot(db, pool);

    const response = await admin.get(statusPath(campaign.campaignId));

    expect(statusSchema.parse(await response.json()).funnel).toEqual({
      scraped: 0,
      researched: 0,
      contactable: 0,
      withEmail: 0,
      needsEmail: 0,
      eligible: { enrich: 0, website: 0, fullenrich: 0 },
      eligibleWithProcessed: { enrich: 0, website: 0, fullenrich: 0 },
    });
  });
});

test("the website step runs only on leads with a website and no email that were never scraped", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const booted = await boot(db, pool);
    const { idsOf } = await seed(booted);

    const response = await booted.admin.post(
      stepPath(booted.campaign.campaignId, "website"),
      { includeProcessed: false },
    );

    expect(response.status).toBe(202);
    const runs = (await runRows(db)).filter((run) => run.step === "website");
    expect(runs).toMatchObject([{ status: "running", total: 1 }]);
    const run = runs[0];
    if (!run) throw new Error("Missing website run");
    const items = await db
      .select()
      .from(pipelineItemsTable)
      .where(eq(pipelineItemsTable.runId, run.runId));
    expect(items.map((item) => item.itemKey)).toEqual(
      idsOf("site").map((leadId) => `lead:${leadId}`),
    );
    expect(booted.queues.website.added).toEqual(
      idsOf("site").map((leadId) => ({
        type: "website-lead",
        runId: run.runId,
        leadId,
      })),
    );
  });
});

test("including already-tried leads adds the scraped ones to the website step but never a lead that has an email", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const booted = await boot(db, pool);
    const { idsOf } = await seed(booted);

    const response = await booted.admin.post(
      stepPath(booted.campaign.campaignId, "website"),
      { includeProcessed: true },
    );

    expect(response.status).toBe(202);
    expect(
      sorted(booted.queues.website.added.map((job) => job.leadId)),
    ).toEqual(idsOf("site", "site-scraped"));
  });
});

test("the email lookup skips leads that already have an email, from any source", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const booted = await boot(db, pool);
    const { idsOf } = await seed(booted);

    const response = await booted.admin.post(
      stepPath(booted.campaign.campaignId, "fullenrich"),
      { includeProcessed: false },
    );

    expect(response.status).toBe(202);
    const runs = (await runRows(db)).filter((run) => run.step === "fullenrich");
    expect(runs).toMatchObject([{ status: "running", total: 3 }]);
    expect(
      sorted(booted.queues.fullenrich.added.map((job) => job.leadId)),
    ).toEqual(idsOf("site", "site-scraped", "inbox"));
  });
});

test("including already-tried leads adds the looked-up ones to the email lookup", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const booted = await boot(db, pool);
    const { idsOf } = await seed(booted);

    const response = await booted.admin.post(
      stepPath(booted.campaign.campaignId, "fullenrich"),
      { includeProcessed: true },
    );

    expect(response.status).toBe(202);
    expect(
      sorted(booted.queues.fullenrich.added.map((job) => job.leadId)),
    ).toEqual(idsOf("site", "site-scraped", "inbox", "inbox-looked"));
  });
});

test("the research step runs on leads without LinkedIn that were never researched, with no scrape run needed", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const booted = await boot(db, pool);
    const { idsOf } = await seed(booted);

    const response = await booted.admin.post(
      stepPath(booted.campaign.campaignId, "enrich"),
      { includeProcessed: false },
    );

    expect(response.status).toBe(202);
    expect(await runRows(db)).toMatchObject([{ step: "enrich", total: 4 }]);
    expect(sorted(booted.queues.enrich.added.map((job) => job.leadId))).toEqual(
      idsOf("plain", "site", "site-scraped", "site-emailed"),
    );
  });
});

test("a step with nothing eligible finishes at once and queues nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, campaign, queues } = await boot(db, pool);

    const response = await admin.post(
      stepPath(campaign.campaignId, "website"),
      {
        includeProcessed: false,
      },
    );

    expect(response.status).toBe(202);
    expect(await runRows(db)).toMatchObject([
      { step: "website", status: "done", total: 0, processed: 0 },
    ]);
    expect(queues.website.added).toEqual([]);
  });
});

test("the email lookup without a configured provider is refused and stores no run", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const context = createContext(db, pool, initENV());
    const admin = await createAdminClient(context, "eligibility@example.com");
    const campaign = await insertCampaign(db);

    const response = await admin.post(
      stepPath(campaign.campaignId, "fullenrich"),
      { includeProcessed: false },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "emailEnrichmentUnavailable",
    });
    expect(await runRows(db)).toEqual([]);
  });
});

test("the step routes refuse anonymous and non-admin callers and an invalid body, and start nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const booted = await boot(db, pool);
    const member = await createAuthenticatedApp({
      context: booted.context,
      email: "eligibility-member@example.com",
    });

    for (const step of ["enrich", "website", "fullenrich"]) {
      const path = stepPath(booted.campaign.campaignId, step);
      const anonymous = await member.app.request(path, { method: "POST" });
      const refused = await member.app.request(path, {
        method: "POST",
        headers: { cookie: member.cookie },
      });
      const invalid = await booted.admin.post(path, {
        includeProcessed: "yes",
      });

      expect(anonymous.status).toBe(401);
      expect(refused.status).toBe(403);
      expect(invalid.status).toBe(400);
    }

    expect(await runRows(db)).toEqual([]);
  });
});

const stages: [string, string[]][] = [
  ["unresearched", ["plain", "site", "site-scraped", "site-emailed"]],
  [
    "researched",
    ["researched-empty", "inbox", "inbox-looked", "inbox-emailed"],
  ],
  [
    "contactable",
    [
      "site",
      "site-scraped",
      "site-emailed",
      "inbox",
      "inbox-looked",
      "inbox-emailed",
    ],
  ],
  ["withEmail", ["site-emailed", "inbox-emailed"]],
  ["needsEmail", ["site", "site-scraped", "inbox", "inbox-looked"]],
];

for (const [stage, expected] of stages) {
  test(`the ${stage} stage lists only the campaign leads in it`, async () => {
    await withTestDatabase(async ({ db, pool }) => {
      const booted = await boot(db, pool);
      await seed(booted);

      const response = await booted.admin.get(
        `/api/leads?campaignId=${booted.campaign.campaignId}&stage=${stage}&sort=name&order=asc&perPage=100`,
      );

      expect(response.status).toBe(200);
      const list = leadListSchema.parse(await response.json());
      expect(list.leads.map((lead) => lead.username)).toEqual(
        expected.toSorted(),
      );
      expect(list.meta.total).toBe(expected.length);
    });
  });
}

test("a stage combines with search and pagination, and an unknown stage is rejected", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const booted = await boot(db, pool);
    await seed(booted);
    const base = `/api/leads?campaignId=${booted.campaign.campaignId}&stage=needsEmail&sort=name&order=asc`;

    const searched = await booted.admin.get(`${base}&search=inbox`);
    const paged = await booted.admin.get(`${base}&perPage=10&page=2`);
    const unknown = await booted.admin.get("/api/leads?stage=bogus");

    expect(
      leadListSchema
        .parse(await searched.json())
        .leads.map((lead) => lead.username),
    ).toEqual(["inbox", "inbox-looked"]);
    const page = leadListSchema.parse(await paged.json());
    expect(page.leads).toEqual([]);
    expect(page.meta.total).toBe(4);
    expect(unknown.status).toBe(400);
  });
});

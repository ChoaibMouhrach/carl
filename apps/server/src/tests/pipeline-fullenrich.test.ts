import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import z from "zod";
import { initENV } from "@server/config/env";
import type { DB } from "@server/infrastructure/database/client";
import {
  pipelineItemsTable,
  pipelineRunsTable,
} from "@server/infrastructure/database/schemas";
import { createAdminClient } from "./helpers/api";
import { createContext } from "./helpers/context";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";
import {
  FakeContactEnrichment,
  ManualQueue,
  insertCampaign,
  insertRun,
  runRows,
} from "./helpers/pipeline";

type Pool = Parameters<typeof createContext>[1];

const SKOOL = "https://www.skool.com";

const runSchema = z.object({
  runId: z.number(),
  campaignId: z.number(),
  step: z.enum(["scrape", "enrich", "fullenrich"]),
  status: z.enum(["running", "done", "failed"]),
  total: z.number(),
  processed: z.number(),
  failed: z.number(),
  error: z.string().nullable(),
});

const errorSchema = z.object({ code: z.string() });

const statusSchema = z.object({
  fullenrich: runSchema.nullable(),
  emailEnrichmentAvailable: z.boolean(),
  emailedCount: z.number(),
});

const boot = async (
  db: DB,
  pool: Pool,
  options: { provider?: FakeContactEnrichment } = {},
) => {
  const context = createContext(db, pool, initENV());

  if (options.provider) {
    context.contactEnrichment = options.provider;
  }

  const admin = await createAdminClient(context, "fullenrich-api@example.com");

  return { context, admin };
};

const fullenrichPath = (campaignId: number) =>
  `/api/campaigns/${campaignId}/pipeline/fullenrich`;
const statusPath = (campaignId: number) =>
  `/api/campaigns/${campaignId}/pipeline`;

const fullenrichRuns = async (db: DB) =>
  (await runRows(db)).filter((run) => run.step === "fullenrich");

interface LeadSpec {
  username: string;
  website?: string;
  linkedin?: string;
  itemStatus?: "processed" | "failed";
  inCampaign?: boolean;
}

const seedEnrichedLeads = async (
  context: ReturnType<typeof createContext>,
  db: DB,
  campaignId: number,
  specs: LeadSpec[],
) => {
  const enrichRun = await insertRun(db, {
    campaignId,
    step: "enrich",
    status: "done",
  });
  const leads: Record<string, number> = {};

  for (const spec of specs) {
    const lead = await context.repositories.lead.create({
      name: spec.username,
      username: spec.username,
      skoolUrl: `${SKOOL}/@${spec.username}`,
    });
    leads[spec.username] = lead.leadId;

    if (spec.inCampaign !== false) {
      await context.repositories.campaign.addLeads({
        campaignId,
        leadIds: [lead.leadId],
      });
    }

    await db.insert(pipelineItemsTable).values({
      runId: enrichRun.runId,
      itemKey: `lead:${lead.leadId}`,
      leadId: lead.leadId,
      status: spec.itemStatus ?? "processed",
      website: spec.website ?? null,
      linkedin: spec.linkedin ?? null,
    });
  }

  return { enrichRun, leads };
};

test("the email enrichment route refuses anonymous and non-admin callers and starts nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context } = await boot(db, pool, {
      provider: new FakeContactEnrichment(),
    });
    const campaign = await insertCampaign(db);
    const member = await createAuthenticatedApp({
      context,
      email: "fullenrich-member@example.com",
    });
    const path = fullenrichPath(campaign.campaignId);

    const anonymous = await member.app.request(path, { method: "POST" });
    expect(anonymous.status).toBe(401);

    const refused = await member.app.request(path, {
      method: "POST",
      headers: { cookie: member.cookie },
    });
    expect(refused.status).toBe(403);

    expect(await runRows(db)).toHaveLength(0);
    expect(context.queueHub.fullenrich.added).toHaveLength(0);
  });
});

test("an unknown campaign is a 404 and an invalid id is a 400, and no run or job is created", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool, {
      provider: new FakeContactEnrichment(),
    });

    const missing = await admin.post(fullenrichPath(987654));
    expect(missing.status).toBe(404);
    expect(errorSchema.parse(await missing.json()).code).toBe(
      "campaignNotFound",
    );

    for (const id of [0, -1]) {
      expect((await admin.post(fullenrichPath(id))).status).toBe(400);
    }
    expect(
      (await admin.post("/api/campaigns/abc/pipeline/fullenrich")).status,
    ).toBe(400);

    expect(await runRows(db)).toHaveLength(0);
    expect(context.queueHub.fullenrich.added).toHaveLength(0);
  });
});

test("starting without a configured email provider is refused and stores no run", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool);
    const campaign = await insertCampaign(db);
    await seedEnrichedLeads(context, db, campaign.campaignId, [
      { username: "ann", website: "https://ann.example.com" },
    ]);

    const response = await admin.post(fullenrichPath(campaign.campaignId));

    expect(response.status).toBe(400);
    expect(errorSchema.parse(await response.json()).code).toBe(
      "emailEnrichmentUnavailable",
    );
    expect(await fullenrichRuns(db)).toHaveLength(0);
    expect(context.queueHub.fullenrich.added).toHaveLength(0);
  });
});

test("it needs a finished enrich of the same campaign and stores no run otherwise", async () => {
  const cases: {
    name: string;
    enrichRuns?: {
      status: "running" | "failed" | "done";
      itemsReady?: boolean;
    }[];
    other?: boolean;
    scrape?: boolean;
  }[] = [
    { name: "no enrich at all", enrichRuns: [] },
    {
      name: "an enrich still running",
      enrichRuns: [{ status: "running" }],
    },
    {
      name: "only a failed enrich",
      enrichRuns: [{ status: "failed" }],
    },
    {
      name: "a legacy enrich without saved results",
      enrichRuns: [{ status: "done", itemsReady: false }],
    },
    { name: "a finished enrich of another campaign", other: true },
    { name: "only a finished scrape", scrape: true },
  ];

  for (const scenario of cases) {
    await withTestDatabase(async ({ db, pool }) => {
      const { context, admin } = await boot(db, pool, {
        provider: new FakeContactEnrichment(),
      });
      const campaign = await insertCampaign(db, { name: "Target" });
      const other = await insertCampaign(db, { name: "Other" });

      for (const enrich of scenario.enrichRuns ?? []) {
        await insertRun(db, {
          campaignId: campaign.campaignId,
          step: "enrich",
          status: enrich.status,
          itemsReady:
            "itemsReady" in enrich
              ? enrich.itemsReady
              : enrich.status === "done",
        });
      }

      if (scenario.other) {
        await insertRun(db, {
          campaignId: other.campaignId,
          step: "enrich",
          status: "done",
        });
      }

      if (scenario.scrape) {
        await insertRun(db, {
          campaignId: campaign.campaignId,
          step: "scrape",
          status: "done",
        });
      }

      const response = await admin.post(fullenrichPath(campaign.campaignId));

      expect(response.status).toBe(400);
      expect(errorSchema.parse(await response.json()).code).toBe(
        "enrichRequired",
      );
      expect(await fullenrichRuns(db)).toHaveLength(0);
      expect(context.queueHub.fullenrich.added).toHaveLength(0);
    });
  }
});

test("starting stores a running run for only the campaign's processed leads with a website or LinkedIn, and queues one job per lead", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool, {
      provider: new FakeContactEnrichment(),
    });
    const campaign = await insertCampaign(db);
    const { leads } = await seedEnrichedLeads(
      context,
      db,
      campaign.campaignId,
      [
        { username: "site", website: "https://site.example.com" },
        { username: "linked", linkedin: "https://linkedin.com/in/linked" },
        {
          username: "both",
          website: "https://both.example.com",
          linkedin: "https://linkedin.com/in/both",
        },
        { username: "bare" },
        {
          username: "failed",
          website: "https://failed.example.com",
          itemStatus: "failed",
        },
        {
          username: "outsider",
          website: "https://outsider.example.com",
          inCampaign: false,
        },
      ],
    );
    const expectedIds = [leads["site"], leads["linked"], leads["both"]].sort();

    const response = await admin.post(fullenrichPath(campaign.campaignId));

    expect(response.status).toBe(202);
    const returned = runSchema.parse(await response.json());
    const [stored] = await db
      .select()
      .from(pipelineRunsTable)
      .where(eq(pipelineRunsTable.runId, returned.runId));
    expect(stored).toMatchObject({
      step: "fullenrich",
      status: "running",
      total: 3,
      processed: 0,
      failed: 0,
      itemsReady: true,
    });
    const queuedIds = context.queueHub.fullenrich.added
      .map((job) => job.leadId)
      .sort();
    expect(queuedIds).toEqual(expectedIds);
    expect(
      context.queueHub.fullenrich.added.every(
        (job) => job.type === "fullenrich-lead" && job.runId === returned.runId,
      ),
    ).toBe(true);
    const items = await db
      .select()
      .from(pipelineItemsTable)
      .where(eq(pipelineItemsTable.runId, returned.runId));
    expect(items.map((item) => item.itemKey).sort()).toEqual(
      expectedIds.map((leadId) => `lead:${leadId}`).sort(),
    );
    expect(items.every((item) => item.status === "pending")).toBe(true);
  });
});

test("a campaign with no contactable leads finishes at once and queues nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool, {
      provider: new FakeContactEnrichment(),
    });
    const campaign = await insertCampaign(db);
    await seedEnrichedLeads(context, db, campaign.campaignId, [
      { username: "bare" },
    ]);

    const response = await admin.post(fullenrichPath(campaign.campaignId));

    expect(response.status).toBe(202);
    expect(await fullenrichRuns(db)).toMatchObject([
      { status: "done", total: 0, processed: 0, failed: 0 },
    ]);
    expect(context.queueHub.fullenrich.added).toHaveLength(0);
  });
});

test("a second start while one runs is a 409 and adds no run or jobs", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool, {
      provider: new FakeContactEnrichment(),
    });
    const campaign = await insertCampaign(db);
    await seedEnrichedLeads(context, db, campaign.campaignId, [
      { username: "ann", website: "https://ann.example.com" },
    ]);

    const first = await admin.post(fullenrichPath(campaign.campaignId));
    expect(first.status).toBe(202);

    const again = await admin.post(fullenrichPath(campaign.campaignId));

    expect(again.status).toBe(409);
    expect(errorSchema.parse(await again.json()).code).toBe(
      "pipelineRunInProgress",
    );
    expect(await fullenrichRuns(db)).toHaveLength(1);
    expect(context.queueHub.fullenrich.added).toHaveLength(1);
  });
});

test("a queue that refuses the jobs fails the run with the reason", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool, {
      provider: new FakeContactEnrichment(),
    });
    const queue = new ManualQueue<
      Parameters<typeof context.queueHub.fullenrich.add>[0]
    >();
    queue.failAddWith = new Error("redis is down");
    context.queueHub.fullenrich = queue;
    const campaign = await insertCampaign(db);
    await seedEnrichedLeads(context, db, campaign.campaignId, [
      { username: "ann", website: "https://ann.example.com" },
    ]);

    const response = await admin.post(fullenrichPath(campaign.campaignId));

    expect(response.status).toBe(500);
    expect(await fullenrichRuns(db)).toMatchObject([
      { status: "failed", error: "redis is down" },
    ]);
  });
});

test("the status reports the newest run, availability, and counts only processed in-campaign leads that got an email", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool, {
      provider: new FakeContactEnrichment(),
    });
    const campaign = await insertCampaign(db);
    const other = await insertCampaign(db, { name: "Other" });
    await insertRun(db, {
      campaignId: other.campaignId,
      step: "fullenrich",
      status: "done",
    });
    await insertRun(db, {
      campaignId: campaign.campaignId,
      step: "fullenrich",
      status: "failed",
      error: "old",
    });
    const run = await insertRun(db, {
      campaignId: campaign.campaignId,
      step: "fullenrich",
      status: "done",
    });
    const { leads } = await seedEnrichedLeads(
      context,
      db,
      campaign.campaignId,
      [
        { username: "work" },
        { username: "personal" },
        { username: "both" },
        { username: "none" },
        { username: "failed" },
        { username: "outsider", inCampaign: false },
      ],
    );
    const results: {
      username: string;
      status: "processed" | "failed";
      workEmail?: string;
      personalEmail?: string;
    }[] = [
      { username: "work", workEmail: "w@x.com", status: "processed" },
      {
        username: "personal",
        personalEmail: "p@x.com",
        status: "processed",
      },
      {
        username: "both",
        workEmail: "b@x.com",
        personalEmail: "b@home.com",
        status: "processed",
      },
      { username: "none", status: "processed" },
      {
        username: "failed",
        workEmail: "f@x.com",
        status: "failed",
      },
      {
        username: "outsider",
        workEmail: "o@x.com",
        status: "processed",
      },
    ];
    await db.insert(pipelineItemsTable).values(
      results.map((result) => ({
        runId: run.runId,
        itemKey: `lead:${leads[result.username]}`,
        leadId: leads[result.username],
        status: result.status,
      })),
    );
    for (const result of results) {
      const leadId = leads[result.username];
      if (leadId === undefined) throw new Error("Seeded lead is missing.");
      await context.repositories.leadEmail.addMany({
        leadId,
        addresses: result.workEmail ? [result.workEmail] : [],
        source: "fullenrich-work",
      });
      await context.repositories.leadEmail.addMany({
        leadId,
        addresses: result.personalEmail ? [result.personalEmail] : [],
        source: "fullenrich-personal",
      });
    }

    const response = await admin.get(statusPath(campaign.campaignId));

    expect(response.status).toBe(200);
    const status = statusSchema.parse(await response.json());
    expect(status.fullenrich?.runId).toBe(run.runId);
    expect(status.fullenrich?.status).toBe("done");
    expect(status.emailEnrichmentAvailable).toBe(true);
    expect(status.emailedCount).toBe(3);
  });
});

test("the status of a campaign that never ran it reports no run, no emails and no availability without a provider", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin } = await boot(db, pool);
    const campaign = await insertCampaign(db);

    const response = await admin.get(statusPath(campaign.campaignId));

    expect(statusSchema.parse(await response.json())).toEqual({
      fullenrich: null,
      emailEnrichmentAvailable: false,
      emailedCount: 0,
    });
  });
});

import { expect, test } from "bun:test";
import z from "zod";
import { eq } from "drizzle-orm";
import { pipelineItemsTable } from "@server/infrastructure/database/schemas";
import type { WebsiteJob } from "@server/lib/base-queue";
import { createAdminClient } from "./helpers/api";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";
import {
  insertCampaign,
  insertRun,
  insertRunResults,
  ManualQueue,
  runRows,
} from "./helpers/pipeline";

const path = (campaignId: number) =>
  `/api/campaigns/${campaignId}/pipeline/website`;

test("website starts reject anonymous and non-admin callers without writing a run", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const campaign = await insertCampaign(db);
    const member = await createAuthenticatedApp({
      context,
      email: "website-member@example.com",
    });

    const anonymous = await member.app.request(path(campaign.campaignId), {
      method: "POST",
    });
    const refused = await member.app.request(path(campaign.campaignId), {
      method: "POST",
      headers: { cookie: member.cookie },
    });

    expect(anonymous.status).toBe(401);
    expect(refused.status).toBe(403);
    expect(await runRows(db)).toEqual([]);
    expect(await db.select().from(pipelineItemsTable)).toEqual([]);
  });
});

const prerequisites: {
  name: string;
  status?: "running" | "failed" | "done";
  itemsReady?: boolean;
  otherCampaign?: boolean;
}[] = [
  { name: "missing enrichment" },
  { name: "running enrichment", status: "running" },
  { name: "failed enrichment", status: "failed" },
  { name: "legacy enrichment", status: "done", itemsReady: false },
  {
    name: "another campaign's enrichment",
    status: "done",
    otherCampaign: true,
  },
];

for (const scenario of prerequisites) {
  test(`website scraping refuses ${scenario.name} without changing stored runs`, async () => {
    await withTestDatabase(async ({ context, db }) => {
      const admin = await createAdminClient(
        context,
        "website-admin@example.com",
      );
      const campaign = await insertCampaign(db);
      const other = await insertCampaign(db);
      if (scenario.status) {
        await insertRun(db, {
          campaignId: scenario.otherCampaign
            ? other.campaignId
            : campaign.campaignId,
          step: "enrich",
          status: scenario.status,
          itemsReady: scenario.itemsReady ?? scenario.status === "done",
        });
      }
      const before = await runRows(db);

      const response = await admin.post(path(campaign.campaignId));

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: "enrichRequired" });
      expect(await runRows(db)).toEqual(before);
      expect(await db.select().from(pipelineItemsTable)).toEqual([]);
    });
  });
}

test("website selection uses only the latest enrichment's processed website results still linked to the campaign", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(context, "website-admin@example.com");
    const campaign = await insertCampaign(db);
    const old = await insertRun(db, {
      campaignId: campaign.campaignId,
      step: "enrich",
      status: "done",
    });
    const latest = await insertRun(db, {
      campaignId: campaign.campaignId,
      step: "enrich",
      status: "done",
    });
    const specs = [
      {
        username: "eligible",
        website: "https://eligible.com",
        linked: true,
        current: true,
        status: "processed",
      },
      {
        username: "linkedin-only",
        website: null,
        linked: true,
        current: true,
        status: "processed",
      },
      {
        username: "failed",
        website: "https://failed.com",
        linked: true,
        current: true,
        status: "failed",
      },
      {
        username: "unlinked",
        website: "https://unlinked.com",
        linked: false,
        current: true,
        status: "processed",
      },
      {
        username: "stale",
        website: "https://stale.com",
        linked: true,
        current: false,
        status: "processed",
      },
    ];
    const expected: number[] = [];
    for (const spec of specs) {
      const lead = await context.repositories.lead.create({
        name: spec.username,
        username: spec.username,
        skoolUrl: `https://www.skool.com/@${spec.username}`,
        website: "https://global.com",
        linkedin: "https://linkedin.com/in/coach",
      });
      if (spec.linked)
        await context.repositories.campaign.addLeads({
          campaignId: campaign.campaignId,
          leadIds: [lead.leadId],
        });
      await insertRunResults(db, spec.current ? latest.runId : old.runId, [
        { ...lead, website: spec.website },
      ]);
      if (spec.status === "failed")
        await db
          .update(pipelineItemsTable)
          .set({ status: "failed" })
          .where(eq(pipelineItemsTable.leadId, lead.leadId));
      if (spec.username === "eligible") expected.push(lead.leadId);
    }
    const queue = new ManualQueue<WebsiteJob>();
    context.queueHub.website = queue;

    const started = await admin.post(path(campaign.campaignId));
    const duplicate = await admin.post(path(campaign.campaignId));

    expect(started.status).toBe(202);
    expect(duplicate.status).toBe(409);
    const runs = await runRows(db);
    const website = runs.filter((run) => run.step === "website");
    expect(website).toMatchObject([
      { status: "running", total: 1, processed: 0, itemsReady: true },
    ]);
    const run = website[0];
    if (!run) throw new Error("Missing website run");
    const items = await db
      .select()
      .from(pipelineItemsTable)
      .where(eq(pipelineItemsTable.runId, run.runId));
    expect(items).toMatchObject(
      expected.map((leadId) => ({
        itemKey: `lead:${leadId}`,
        status: "pending",
      })),
    );
    expect(queue.added).toEqual(
      expected.map((leadId) => ({
        type: "website-lead",
        runId: run.runId,
        leadId,
      })),
    );
  });
});

test("an empty website selection finishes without jobs", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(context, "website-admin@example.com");
    const campaign = await insertCampaign(db);
    await insertRun(db, {
      campaignId: campaign.campaignId,
      step: "enrich",
      status: "done",
    });

    const response = await admin.post(path(campaign.campaignId));

    expect(response.status).toBe(202);
    const runs = await runRows(db);
    expect(runs.filter((run) => run.step === "website")).toMatchObject([
      { status: "done", total: 0, processed: 0, failed: 0, itemsReady: true },
    ]);
    expect(await db.select().from(pipelineItemsTable)).toEqual([]);
  });
});

test("a website queue failure persists a failed run and allows a fresh start", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(context, "website-admin@example.com");
    const campaign = await insertCampaign(db);
    const enrich = await insertRun(db, {
      campaignId: campaign.campaignId,
      step: "enrich",
      status: "done",
    });
    const lead = await context.repositories.lead.create({
      name: "Coach",
      username: "coach",
      skoolUrl: "https://www.skool.com/@coach",
      website: "https://coach.com",
    });
    await context.repositories.campaign.addLeads({
      campaignId: campaign.campaignId,
      leadIds: [lead.leadId],
    });
    await insertRunResults(db, enrich.runId, [lead]);
    const queue = new ManualQueue<WebsiteJob>();
    context.queueHub.website = queue;
    queue.failAddWith = new Error("queue unavailable");

    const failed = await admin.post(path(campaign.campaignId));

    expect(failed.status).toBe(500);
    const failedRuns = await runRows(db);
    expect(failedRuns.filter((run) => run.step === "website")).toMatchObject([
      { status: "failed", total: 1, error: "queue unavailable" },
    ]);
    queue.failAddWith = undefined;

    const restarted = await admin.post(path(campaign.campaignId));

    expect(restarted.status).toBe(202);
    const runs = await runRows(db);
    expect(
      runs
        .filter((run) => run.step === "website")
        .map((run) => run.status)
        .sort(),
    ).toEqual(["failed", "running"]);
    expect(await db.select().from(pipelineItemsTable)).toHaveLength(3);
    expect(queue.added).toHaveLength(1);
  });
});

test("website status and list count distinct processed campaign leads with website-source emails", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(context, "website-admin@example.com");
    const campaign = await insertCampaign(db);
    const run = await insertRun(db, {
      campaignId: campaign.campaignId,
      step: "website",
      status: "done",
    });
    const specs: {
      username: string;
      source: "website" | "manual";
      linked: boolean;
      failed: boolean;
    }[] = [
      { username: "found", source: "website", linked: true, failed: false },
      { username: "manual", source: "manual", linked: true, failed: false },
      { username: "failed", source: "website", linked: true, failed: true },
      { username: "unlinked", source: "website", linked: false, failed: false },
    ];
    const expected: number[] = [];
    for (const spec of specs) {
      const lead = await context.repositories.lead.create({
        name: spec.username,
        username: spec.username,
        skoolUrl: `https://www.skool.com/@${spec.username}`,
      });
      if (spec.linked)
        await context.repositories.campaign.addLeads({
          campaignId: campaign.campaignId,
          leadIds: [lead.leadId],
        });
      await insertRunResults(db, run.runId, [lead]);
      if (spec.failed)
        await db
          .update(pipelineItemsTable)
          .set({ status: "failed" })
          .where(eq(pipelineItemsTable.leadId, lead.leadId));
      await context.repositories.leadEmail.addMany({
        leadId: lead.leadId,
        addresses: [
          `${spec.username}@coach.com`,
          `${spec.username}2@coach.com`,
        ],
        source: spec.source,
      });
      if (spec.username === "found") expected.push(lead.leadId);
    }

    const status = await admin.get(
      `/api/campaigns/${campaign.campaignId}/pipeline`,
    );
    const listed = await admin.get(
      `/api/leads?campaignId=${campaign.campaignId}&pipelineStep=website`,
    );

    expect(status.status).toBe(200);
    const parsedStatus = z
      .object({
        websiteEmailedCount: z.number(),
        emailedCount: z.number(),
        websiteCount: z.number(),
      })
      .parse(await status.json());
    expect(parsedStatus).toEqual({
      websiteEmailedCount: 1,
      emailedCount: 0,
      websiteCount: 0,
    });
    expect(listed.status).toBe(200);
    const parsedList = z
      .object({
        leads: z.array(z.object({ leadId: z.number() })),
        meta: z.object({ total: z.number() }),
      })
      .parse(await listed.json());
    expect(parsedList.leads.map((lead) => lead.leadId)).toEqual(expected);
    expect(parsedList.meta.total).toBe(1);
  });
});

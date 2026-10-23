import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { initENV } from "@server/config/env";
import {
  campaignLeadsTable,
  emailEnrichmentsTable,
  leadsTable,
  type LeadInsert,
} from "@server/infrastructure/database/schemas";
import type { EmailBatchSnapshot } from "@server/lib/base-email-finder";
import { Services } from "@server/services";
import { createAdminClient, seedLead } from "./helpers/api";
import {
  createContext,
  FakeEmailFinder,
  TestLogger,
  TestMailer,
} from "./helpers/context";
import { initApp } from "@server/app";
import { withTestDatabase } from "./helpers/http";

type Database = Parameters<Parameters<typeof withTestDatabase>[0]>[0];

const MINUTE = 60_000;

const setup = async (
  { db, pool }: Database,
  input: { leads?: number; env?: Partial<ReturnType<typeof initENV>> } = {},
) => {
  const emailFinder = new FakeEmailFinder();
  emailFinder.deferred = true;
  const context = createContext(
    db,
    pool,
    { ...initENV(), ...input.env },
    new TestMailer(),
    undefined,
    undefined,
    undefined,
    undefined,
    emailFinder,
  );
  const admin = await createAdminClient(context, "webhook-admin@example.com");
  const campaign = await context.repositories.campaign.create({
    name: "Webhook",
    keywords: ["coaching"],
    types: ["public"],
    pricingModels: ["paid"],
    status: "active",
  });
  const leads = [];
  for (let index = 0; index < (input.leads ?? 3); index += 1) {
    const spec: Partial<LeadInsert> = {
      skoolUsername: `hook-${index}`,
      name: `Jane Doe${index}`,
      linkedinUrl: `https://www.linkedin.com/in/hook-${index}`,
    };

    leads.push(await seedLead(context, spec));
  }
  await context.repositories.campaignLead.attach({
    campaignId: campaign.campaignId,
    leads: leads.map((lead) => ({ leadId: lead.leadId, keyword: "coaching" })),
    stage: 3,
    status: "done",
  });
  const services = new Services({ context });
  await services.findEmail.start({ campaignId: campaign.campaignId });
  await services.findEmail.runCampaign({ campaignId: campaign.campaignId });
  const [enrichment] = await db.select().from(emailEnrichmentsTable);

  if (!enrichment) throw new Error("No batch was started.");

  const send = (
    snapshot: Partial<EmailBatchSnapshot>,
    signature: string | null = "valid",
  ) =>
    createApp(context).then((app) =>
      app.request("/api/webhooks/email-finder", {
        method: "POST",
        headers: signature ? { "x-signature-sha1": signature } : {},
        body: JSON.stringify({
          providerId: enrichment.providerId,
          batchId: enrichment.batchId,
          state: "waiting",
          reason: null,
          results: [],
          ...snapshot,
        } satisfies EmailBatchSnapshot),
      }),
    );

  return {
    emailFinder,
    context,
    admin,
    campaign,
    leads,
    services,
    enrichment,
    send,
    path: `/api/campaigns/${campaign.campaignId}`,
  };
};

const createApp = (context: Parameters<typeof initApp>[0]["context"]) =>
  initApp({ context });

const rowOf = async (db: Database["db"], campaignId: number, leadId: number) =>
  (
    await db
      .select()
      .from(campaignLeadsTable)
      .where(eq(campaignLeadsTable.leadId, leadId))
  ).find((row) => row.campaignId === campaignId);

const emailsOf = async (db: Database["db"], leadId: number) =>
  (await db.select().from(leadsTable).where(eq(leadsTable.leadId, leadId)))[0]
    ?.emails;

const statuses = async (
  db: Database["db"],
  campaignId: number,
  leadIds: number[],
) => {
  const rows = [];

  for (const leadId of leadIds) {
    const row = await rowOf(db, campaignId, leadId);
    rows.push([row?.status, row?.failureReason]);
  }

  return rows;
};

const batchOf = async (db: Database["db"]) =>
  (await db.select().from(emailEnrichmentsTable))[0];

test("a run hands the leads to the provider and leaves them running with a batch waiting, and the webhook address is sent only when the API is public", async () => {
  await withTestDatabase(async (database) => {
    const local = await setup(database);

    expect(local.emailFinder.starts).toHaveLength(1);
    expect(local.emailFinder.starts[0]?.webhookUrl).toBeNull();
    expect(local.enrichment).toMatchObject({
      campaignId: local.campaign.campaignId,
      status: "waiting",
      providerId: "fake-1",
      failureReason: null,
      finishedAt: null,
    });
    expect(local.enrichment.batchId).toBe(local.emailFinder.starts[0]?.batchId);
    expect(local.enrichment.groups).toEqual(
      local.leads.map((lead) => [lead.leadId]),
    );
    expect(
      await statuses(
        database.db,
        local.campaign.campaignId,
        local.leads.map((lead) => lead.leadId),
      ),
    ).toEqual([
      ["running", null],
      ["running", null],
      ["running", null],
    ]);
  });

  await withTestDatabase(async (database) => {
    const publicApi = await setup(database, {
      env: { VITE_API_URL: "https://api.example.com" },
    });

    expect(publicApi.emailFinder.starts[0]?.webhookUrl).toBe(
      "https://api.example.com/api/webhooks/email-finder",
    );
  });
});

test("while a batch is waiting a new start is refused with nothing moved, and running the job again does not send the same leads twice", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, services, campaign, leads, emailFinder, enrichment } =
      await setup(database);

    const refused = await admin.post(`${path}/find-email/run`);
    await services.findEmail.runCampaign({ campaignId: campaign.campaignId });

    expect(refused.status).toBe(409);
    expect(emailFinder.starts).toHaveLength(1);
    expect(
      await statuses(
        database.db,
        campaign.campaignId,
        leads.map((lead) => lead.leadId),
      ),
    ).toEqual([
      ["running", null],
      ["running", null],
      ["running", null],
    ]);
    expect((await batchOf(database.db))?.status).toBe("waiting");
    expect(
      await database.db.$count(
        emailEnrichmentsTable,
        eq(emailEnrichmentsTable.batchId, enrichment.batchId),
      ),
    ).toBe(1);
  });
});

test("the webhook needs no login: a contact's answer finishes that lead only, and the batch's answer finishes the rest, with emails in lower case", async () => {
  await withTestDatabase(async (database) => {
    const { campaign, leads, send, context } = await setup(database);
    context.eventBus.published.length = 0;

    const contact = await send({
      results: [{ ref: 1, email: "One@Example.COM" }],
    });

    expect(contact.status).toBe(200);
    expect(await contact.json()).toEqual({ applied: true });
    expect(
      await statuses(
        database.db,
        campaign.campaignId,
        leads.map((lead) => lead.leadId),
      ),
    ).toEqual([
      ["running", null],
      ["done", null],
      ["running", null],
    ]);
    expect(await emailsOf(database.db, leads[1]?.leadId ?? 0)).toEqual([
      "one@example.com",
    ]);
    expect((await batchOf(database.db))?.status).toBe("waiting");
    expect(context.eventBus.published).toEqual(["campaigns.changed"]);

    const batch = await send({
      state: "finished",
      results: [
        { ref: 0, email: "zero@example.com" },
        { ref: 1, email: "one@example.com" },
        { ref: 2, email: null },
      ],
    });

    expect(batch.status).toBe(200);
    expect(
      await statuses(
        database.db,
        campaign.campaignId,
        leads.map((lead) => lead.leadId),
      ),
    ).toEqual([
      ["done", null],
      ["done", null],
      ["failed", "No email found"],
    ]);
    expect(
      await Promise.all(
        leads.map((lead) => emailsOf(database.db, lead.leadId)),
      ),
    ).toEqual([["zero@example.com"], ["one@example.com"], []]);
    expect(await batchOf(database.db)).toMatchObject({
      status: "finished",
      failureReason: null,
    });
    expect((await batchOf(database.db))?.finishedAt).toBeInstanceOf(Date);
    expect(context.eventBus.published).toContain("leads.changed");
  });
});

test("a lead the final answer does not mention is failed with no email found", async () => {
  await withTestDatabase(async (database) => {
    const { campaign, leads, send } = await setup(database);

    await send({
      state: "finished",
      results: [{ ref: 0, email: "zero@example.com" }],
    });

    expect(
      await statuses(
        database.db,
        campaign.campaignId,
        leads.map((lead) => lead.leadId),
      ),
    ).toEqual([
      ["done", null],
      ["failed", "No email found"],
      ["failed", "No email found"],
    ]);
  });
});

test("the same webhook delivered again changes nothing, and an answer after the batch is over is ignored", async () => {
  await withTestDatabase(async (database) => {
    const { campaign, leads, send } = await setup(database);
    const final = {
      state: "finished" as const,
      results: [
        { ref: 0, email: "zero@example.com" },
        { ref: 1, email: null },
        { ref: 2, email: "two@example.com" },
      ],
    };
    await send(final);
    const before = await batchOf(database.db);

    const again = await send(final);
    const late = await send({
      results: [{ ref: 1, email: "late@example.com" }],
    });

    expect(await again.json()).toEqual({ applied: false });
    expect(await late.json()).toEqual({ applied: false });
    expect(
      await Promise.all(
        leads.map((lead) => emailsOf(database.db, lead.leadId)),
      ),
    ).toEqual([["zero@example.com"], [], ["two@example.com"]]);
    expect(
      await statuses(
        database.db,
        campaign.campaignId,
        leads.map((lead) => lead.leadId),
      ),
    ).toEqual([
      ["done", null],
      ["failed", "No email found"],
      ["done", null],
    ]);
    expect(await batchOf(database.db)).toEqual(before);
  });
});

test("a webhook with a bad or missing signature is refused with 401 and nothing changes", async () => {
  await withTestDatabase(async (database) => {
    const { campaign, leads, send, context } = await setup(database);
    const forged = {
      state: "finished" as const,
      results: [{ ref: 0, email: "evil@example.com" }],
    };

    const logger = context.logger;
    if (!(logger instanceof TestLogger)) throw new Error("expected TestLogger");
    logger.records.length = 0;

    const wrong = await send(forged, "forged");
    const missing = await send(forged, null);

    expect([wrong.status, missing.status]).toEqual([401, 401]);
    expect(
      logger.records.filter(
        (record) =>
          typeof record.message === "object" &&
          "signaturePresent" in record.message,
      ),
    ).toMatchObject([
      {
        message: {
          signaturePresent: true,
          signatureLength: 6,
          signatureLooksLikeSha1Hex: false,
        },
      },
      {
        message: {
          signaturePresent: false,
          signatureLength: 0,
          signatureLooksLikeSha1Hex: false,
        },
      },
    ]);
    expect(
      await statuses(
        database.db,
        campaign.campaignId,
        leads.map((lead) => lead.leadId),
      ),
    ).toEqual([
      ["running", null],
      ["running", null],
      ["running", null],
    ]);
    expect(
      await Promise.all(
        leads.map((lead) => emailsOf(database.db, lead.leadId)),
      ),
    ).toEqual([[], [], []]);
    expect((await batchOf(database.db))?.status).toBe("waiting");
  });
});

test("a signed webhook for a batch this server never started is accepted and ignored", async () => {
  await withTestDatabase(async (database) => {
    const { campaign, leads, send, context } = await setup(database);
    const logger = context.logger;
    if (!(logger instanceof TestLogger)) throw new Error("expected TestLogger");
    logger.records.length = 0;

    const response = await send({
      providerId: "someone-else",
      batchId: "unknown-batch",
      state: "finished",
      results: [{ ref: 0, email: "stray@example.com" }],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ applied: false });
    expect(
      logger.records.filter((record) => record.level === "warn"),
    ).toMatchObject([{ message: { batchId: "unknown-batch" } }]);
    expect(await emailsOf(database.db, leads[0]?.leadId ?? 0)).toEqual([]);
    expect((await batchOf(database.db))?.status).toBe("waiting");
    expect(campaign.campaignId).toBeGreaterThan(0);
  });
});

test("a batch is found by the provider's id when the answer carries no batch id", async () => {
  await withTestDatabase(async (database) => {
    const { campaign, leads, send } = await setup(database);

    await send({
      batchId: null,
      state: "finished",
      results: [
        { ref: 0, email: "a@example.com" },
        { ref: 1, email: "b@example.com" },
        { ref: 2, email: "c@example.com" },
      ],
    });

    expect(
      await statuses(
        database.db,
        campaign.campaignId,
        leads.map((lead) => lead.leadId),
      ),
    ).toEqual([
      ["done", null],
      ["done", null],
      ["done", null],
    ]);
  });
});

test("a provider that gives up keeps the emails it found, fails the rest with its reason, and the next start tries those again", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, campaign, leads, send, emailFinder } =
      await setup(database);

    await send({
      state: "failed",
      reason: "FullEnrich has no credits left.",
      results: [{ ref: 0, email: "found@example.com" }],
    });

    expect(
      await statuses(
        database.db,
        campaign.campaignId,
        leads.map((lead) => lead.leadId),
      ),
    ).toEqual([
      ["done", null],
      ["failed", "FullEnrich has no credits left."],
      ["failed", "FullEnrich has no credits left."],
    ]);
    expect(await emailsOf(database.db, leads[0]?.leadId ?? 0)).toEqual([
      "found@example.com",
    ]);
    expect(await batchOf(database.db)).toMatchObject({
      status: "failed",
      failureReason: "FullEnrich has no credits left.",
    });

    emailFinder.deferred = false;
    emailFinder.answer = () => "later@example.com";
    const restarted = await admin.post(`${path}/find-email/run`);

    expect(restarted.status).toBe(202);
    expect(await restarted.json()).toEqual({ queued: 2 });
    expect(
      await Promise.all(
        leads.map((lead) => emailsOf(database.db, lead.leadId)),
      ),
    ).toEqual([["found@example.com"], [], []]);
  });
});

test("a batch the provider refuses to start is settled as failed at once with the reason on its leads", async () => {
  await withTestDatabase(async (database) => {
    const { services, admin, path, campaign, leads, emailFinder, context } =
      await setup(database);
    await database.db.delete(emailEnrichmentsTable);
    await database.db
      .update(campaignLeadsTable)
      .set({ status: "pending", failureReason: null });
    emailFinder.error = new Error("FullEnrich 401: Unknown api key");

    await services.findEmail.runCampaign({ campaignId: campaign.campaignId });

    const batches = await database.db.select().from(emailEnrichmentsTable);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      status: "failed",
      failureReason: "FullEnrich 401: Unknown api key",
      providerId: null,
    });
    expect(
      await statuses(
        database.db,
        campaign.campaignId,
        leads.map((lead) => lead.leadId),
      ),
    ).toEqual([
      ["failed", "FullEnrich 401: Unknown api key"],
      ["failed", "FullEnrich 401: Unknown api key"],
      ["failed", "FullEnrich 401: Unknown api key"],
    ]);
    emailFinder.error = null;
    expect((await admin.post(`${path}/find-email/run`)).status).toBe(202);
    expect(context.eventBus.published).toContain("leads.changed");
  });
});

const ageBatch = async (db: Database["db"], minutes: number) => {
  await db
    .update(emailEnrichmentsTable)
    .set({ createdAt: new Date(Date.now() - minutes * MINUTE) });
};

test("the sweep asks the provider about batches that have waited too long and applies the answer, and leaves young batches alone", async () => {
  await withTestDatabase(async (database) => {
    const { services, campaign, leads, emailFinder, enrichment } =
      await setup(database);

    await services.findEmail.sweep();

    expect(emailFinder.fetched).toEqual([]);

    await ageBatch(database.db, 6);
    emailFinder.snapshots.set("fake-1", {
      providerId: "fake-1",
      batchId: enrichment.batchId,
      state: "finished",
      reason: null,
      results: [
        { ref: 0, email: "swept@example.com" },
        { ref: 1, email: null },
      ],
    });
    await services.findEmail.sweep();

    expect(emailFinder.fetched).toEqual(["fake-1"]);
    expect(
      await statuses(
        database.db,
        campaign.campaignId,
        leads.map((lead) => lead.leadId),
      ),
    ).toEqual([
      ["done", null],
      ["failed", "No email found"],
      ["failed", "No email found"],
    ]);
    expect(await emailsOf(database.db, leads[0]?.leadId ?? 0)).toEqual([
      "swept@example.com",
    ]);
    expect((await batchOf(database.db))?.status).toBe("finished");

    await services.findEmail.sweep();
    expect(emailFinder.fetched).toEqual(["fake-1"]);
  });
});

test("the sweep leaves a batch that is still in progress waiting, and keeps going when asking about one fails", async () => {
  await withTestDatabase(async (database) => {
    const { services, emailFinder, enrichment, context } =
      await setup(database);
    const logger = context.logger;
    if (!(logger instanceof TestLogger)) throw new Error("expected TestLogger");
    await ageBatch(database.db, 10);
    logger.records.length = 0;

    await services.findEmail.sweep();

    expect(logger.records).toMatchObject([
      {
        level: "warn",
        message: {
          message: "Checking an email batch failed.",
          batchId: enrichment.batchId,
          reason: "No answer prepared for fake-1.",
        },
      },
      { level: "info", message: { waiting: 1, applied: 0 } },
    ]);
    expect((await batchOf(database.db))?.status).toBe("waiting");

    emailFinder.snapshots.set("fake-1", {
      providerId: "fake-1",
      batchId: enrichment.batchId,
      state: "waiting",
      reason: null,
      results: [],
    });
    await services.findEmail.sweep();

    expect((await batchOf(database.db))?.status).toBe("waiting");
  });
});

test("the sweep gives up on a batch that has waited a day and on one that never got started, failing their leads so the next start can try again", async () => {
  await withTestDatabase(async (database) => {
    const { services, campaign, leads, emailFinder, enrichment } =
      await setup(database);
    emailFinder.snapshots.set("fake-1", {
      providerId: "fake-1",
      batchId: enrichment.batchId,
      state: "waiting",
      reason: null,
      results: [{ ref: 0, email: "partial@example.com" }],
    });
    await ageBatch(database.db, 25 * 60);

    await services.findEmail.sweep();

    expect(await batchOf(database.db)).toMatchObject({
      status: "failed",
      failureReason: "FullEnrich did not answer in time.",
    });
    expect(
      await statuses(
        database.db,
        campaign.campaignId,
        leads.map((lead) => lead.leadId),
      ),
    ).toEqual([
      ["done", null],
      ["failed", "FullEnrich did not answer in time."],
      ["failed", "FullEnrich did not answer in time."],
    ]);
  });

  await withTestDatabase(async (database) => {
    const { services, campaign, leads } = await setup(database);
    await database.db.update(emailEnrichmentsTable).set({ providerId: null });
    await ageBatch(database.db, 10);
    await services.findEmail.sweep();

    expect((await batchOf(database.db))?.status).toBe("waiting");

    await ageBatch(database.db, 16);
    await services.findEmail.sweep();

    expect(await batchOf(database.db)).toMatchObject({
      status: "failed",
      failureReason: "The email search was never started.",
    });
    expect(
      await statuses(
        database.db,
        campaign.campaignId,
        leads.map((lead) => lead.leadId),
      ),
    ).toEqual([
      ["failed", "The email search was never started."],
      ["failed", "The email search was never started."],
      ["failed", "The email search was never started."],
    ]);
  });
});

test("deleting a campaign removes its batches", async () => {
  await withTestDatabase(async (database) => {
    const { context, campaign } = await setup(database);
    expect(await database.db.$count(emailEnrichmentsTable)).toBe(1);

    await context.repositories.campaign.removeByCampaignId({
      campaignId: campaign.campaignId,
    });

    expect(await database.db.$count(emailEnrichmentsTable)).toBe(0);
  });
});

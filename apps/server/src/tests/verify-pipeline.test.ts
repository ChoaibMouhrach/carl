import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { initENV } from "@server/config/env";
import type { DB } from "@server/infrastructure/database/client";
import { leadEmailsTable } from "@server/infrastructure/database/schemas";
import type { VerifyJob } from "@server/lib/base-queue";
import { VerifyWorker } from "@server/workers/verify";
import { createAdminClient } from "./helpers/api";
import { createContext } from "./helpers/context";
import { withTestDatabase } from "./helpers/http";
import {
  FakeEmailVerifier,
  ManualQueue,
  insertCampaign,
  runRows,
} from "./helpers/pipeline";

type Pool = Parameters<typeof createContext>[1];

const SKOOL = "https://www.skool.com";

const funnelSchema = z.object({
  funnel: z.object({
    eligible: z.object({ verify: z.number() }),
    eligibleWithProcessed: z.object({ verify: z.number() }),
  }),
  verify: z.object({ status: z.string() }).nullable(),
  emailVerificationAvailable: z.boolean(),
});

const boot = async (db: DB, pool: Pool, withVerifier = true) => {
  const context = createContext(db, pool, initENV());
  const verifier = new FakeEmailVerifier();
  const queue = new ManualQueue<VerifyJob>();
  context.queueHub.verify = queue;
  if (withVerifier) context.emailVerifier = verifier;
  await new VerifyWorker({ context }).run();
  const admin = await createAdminClient(context, "verify@example.com");
  const campaign = await insertCampaign(db);
  const path = `/api/campaigns/${campaign.campaignId}/pipeline`;
  let delivered = 0;

  const drain = async () => {
    while (delivered < queue.added.length) {
      const job = queue.added[delivered];
      delivered += 1;
      if (job) await queue.deliver(job);
    }
  };

  const addLead = async (username: string, addresses: string[]) => {
    const lead = await context.repositories.lead.create({
      name: username,
      username,
      skoolUrl: `${SKOOL}/@${username}`,
    });
    await context.repositories.campaign.addLeads({
      campaignId: campaign.campaignId,
      leadIds: [lead.leadId],
    });
    await context.repositories.leadEmail.addMany({
      leadId: lead.leadId,
      addresses,
      source: "website",
    });

    return lead;
  };

  const state = async () =>
    funnelSchema.parse(await (await admin.get(path)).json());

  const start = async (includeProcessed = false) =>
    await admin.post(`${path}/verify`, { includeProcessed });

  return {
    context,
    verifier,
    queue,
    admin,
    campaign,
    drain,
    addLead,
    state,
    start,
  };
};

test("without an Apify token the step refuses to start, writes no run and queues nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const b = await boot(db, pool, false);
    await b.addLead("ann", ["ann@coach.com"]);

    const response = await b.start();

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "emailVerificationUnavailable",
    });
    expect(await runRows(db)).toEqual([]);
    expect(b.queue.added).toEqual([]);
    expect((await b.state()).emailVerificationAvailable).toBe(false);
  });
});

test("a campaign that does not exist cannot start the step", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const b = await boot(db, pool);

    const response = await b.admin.post(
      "/api/campaigns/999999/pipeline/verify",
      { includeProcessed: false },
    );

    expect(response.status).toBe(404);
    expect(await runRows(db)).toEqual([]);
    expect(b.queue.added).toEqual([]);
  });
});

test("only leads with an unverified email are queued, one job each, and the run finishes", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const b = await boot(db, pool);
    const ann = await b.addLead("ann", ["ann@coach.com", "ann2@coach.com"]);
    const bob = await b.addLead("bob", ["bob@coach.com"]);
    await b.addLead("cher", []);
    await b.context.repositories.leadEmail.recordVerifications({
      leadId: bob.leadId,
      results: [{ address: "bob@coach.com", verification: "valid" }],
      verifiedAt: new Date("2026-01-01T00:00:00Z"),
    });
    expect((await b.state()).funnel.eligible.verify).toBe(1);

    const response = await b.start();
    await b.drain();

    expect(response.status).toBe(202);
    expect(b.queue.added.map((job) => job.leadId)).toEqual([ann.leadId]);
    expect(b.verifier.calls).toEqual([["ann@coach.com", "ann2@coach.com"]]);
    expect(await runRows(db)).toMatchObject([
      { step: "verify", total: 1, processed: 1, failed: 0, status: "done" },
    ]);
    const stored = await db
      .select({
        address: leadEmailsTable.address,
        verification: leadEmailsTable.verification,
      })
      .from(leadEmailsTable)
      .orderBy(leadEmailsTable.emailId);
    expect(stored).toEqual([
      { address: "ann@coach.com", verification: "valid" },
      { address: "ann2@coach.com", verification: "valid" },
      { address: "bob@coach.com", verification: "valid" },
    ]);
  });
});

test("running the step again pays for nothing, and including tried leads pays for them once more", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const b = await boot(db, pool);
    await b.addLead("ann", ["ann@coach.com"]);
    await b.start();
    await b.drain();
    expect(b.verifier.calls).toHaveLength(1);
    expect(await b.state()).toMatchObject({
      funnel: { eligible: { verify: 0 }, eligibleWithProcessed: { verify: 1 } },
    });

    const again = await b.start();
    await b.drain();

    expect(again.status).toBe(202);
    expect(b.verifier.calls).toHaveLength(1);
    expect(await runRows(db)).toMatchObject([
      { total: 1, status: "done" },
      { total: 0, status: "done" },
    ]);

    const forced = await b.start(true);
    await b.drain();

    expect(forced.status).toBe(202);
    expect(b.verifier.calls).toHaveLength(2);
  });
});

test("a second run cannot start while the first is still going", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const b = await boot(db, pool);
    await b.addLead("ann", ["ann@coach.com"]);
    await b.start();

    const second = await b.start();

    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({
      code: "pipelineRunInProgress",
    });
    expect(await runRows(db)).toHaveLength(1);
    expect(b.queue.added).toHaveLength(1);
  });
});

test("an email added after a verification makes its lead eligible again", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const b = await boot(db, pool);
    const ann = await b.addLead("ann", ["ann@coach.com"]);
    await b.start();
    await b.drain();
    expect((await b.state()).funnel.eligible.verify).toBe(0);

    await b.context.repositories.leadEmail.addMany({
      leadId: ann.leadId,
      addresses: ["new@coach.com"],
      source: "manual",
    });

    expect((await b.state()).funnel.eligible.verify).toBe(1);
    const rows = await db
      .select({
        address: leadEmailsTable.address,
        verifiedAt: leadEmailsTable.verifiedAt,
      })
      .from(leadEmailsTable)
      .where(eq(leadEmailsTable.leadId, ann.leadId))
      .orderBy(leadEmailsTable.emailId);
    expect(rows.map((row) => row.verifiedAt === null)).toEqual([false, true]);
  });
});

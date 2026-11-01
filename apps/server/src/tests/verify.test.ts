import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import z from "zod";
import { initENV } from "@server/config/env";
import type { DB } from "@server/infrastructure/database/client";
import {
  leadEmailsTable,
  pipelineItemsTable,
} from "@server/infrastructure/database/schemas";
import { EmailVerifierError } from "@server/lib/base-email-verifier";
import { NonRetryableJobError, type VerifyJob } from "@server/lib/base-queue";
import { VerifyWorker } from "@server/workers/verify";
import type { LeadEmailVerification } from "@repo/constants/lead-emails";
import type { LeadEmailSource } from "@repo/constants/lead-emails";
import { createContext } from "./helpers/context";
import { withTestDatabase } from "./helpers/http";
import {
  FakeEmailVerifier,
  ManualQueue,
  insertCampaign,
  insertRun,
  runRows,
} from "./helpers/pipeline";

type Pool = Parameters<typeof createContext>[1];

const SKOOL = "https://www.skool.com";

interface StoredEmail {
  address: string;
  source?: LeadEmailSource;
  status?: "deliverable" | "highProbability" | "catchAll" | "unknown";
}

const boot = async (
  db: DB,
  pool: Pool,
  respond?: (address: string) => LeadEmailVerification,
  verifier?: FakeEmailVerifier,
) => {
  const context = createContext(db, pool, initENV());
  const queue = new ManualQueue<VerifyJob>();
  const fake = verifier ?? new FakeEmailVerifier(respond);
  context.queueHub.verify = queue;
  context.emailVerifier = fake;
  await new VerifyWorker({ context }).run();

  return { context, queue, fake };
};

const verifyJob = (runId: number, leadId: number): VerifyJob => ({
  type: "verify-lead",
  runId,
  leadId,
});

const seedLead = async (
  context: ReturnType<typeof createContext>,
  db: DB,
  emails: StoredEmail[],
  username = "anncoach",
) => {
  const campaign = await insertCampaign(db);
  const run = await insertRun(db, {
    campaignId: campaign.campaignId,
    step: "verify",
    total: 1,
  });
  const lead = await context.repositories.lead.create({
    name: "Ann Coach",
    username,
    skoolUrl: `${SKOOL}/@${username}`,
  });
  await context.repositories.campaign.addLeads({
    campaignId: campaign.campaignId,
    leadIds: [lead.leadId],
  });
  for (const email of emails) {
    await context.repositories.leadEmail.addMany({
      leadId: lead.leadId,
      addresses: [email.address],
      source: email.source ?? "website",
      status: email.status,
    });
  }

  return { campaign, run, lead, job: verifyJob(run.runId, lead.leadId) };
};

const emailRows = async (db: DB, leadId: number) =>
  await db
    .select({
      address: leadEmailsTable.address,
      source: leadEmailsTable.source,
      status: leadEmailsTable.status,
      verification: leadEmailsTable.verification,
      verifiedAt: leadEmailsTable.verifiedAt,
    })
    .from(leadEmailsTable)
    .where(eq(leadEmailsTable.leadId, leadId))
    .orderBy(leadEmailsTable.emailId);

const runRow = async (db: DB, runId: number) => {
  const row = (await runRows(db)).find((run) => run.runId === runId);
  if (!row) throw new Error(`Run ${runId} is missing.`);

  return row;
};

const itemRow = async (db: DB, runId: number, leadId: number) => {
  const [row] = await db
    .select()
    .from(pipelineItemsTable)
    .where(
      and(
        eq(pipelineItemsTable.runId, runId),
        eq(pipelineItemsTable.itemKey, `lead:${leadId}`),
      ),
    );
  if (!row) throw new Error(`Item for lead ${leadId} is missing.`);

  return row;
};

test("every email of a lead is verified and stamped, its source and FullEnrich status are left alone, and the run finishes", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, queue, fake } = await boot(db, pool, (address) =>
      address.startsWith("bad") ? "invalid" : "valid",
    );
    const { lead, run, job } = await seedLead(context, db, [
      {
        address: "ann@anncoach.com",
        source: "fullenrich-work",
        status: "deliverable",
      },
      { address: "bad@anncoach.com", source: "website" },
    ]);

    await queue.deliver(job);

    expect(fake.calls).toEqual([["ann@anncoach.com", "bad@anncoach.com"]]);
    const rows = await emailRows(db, lead.leadId);
    expect(rows).toMatchObject([
      {
        address: "ann@anncoach.com",
        source: "fullenrich-work",
        status: "deliverable",
        verification: "valid",
      },
      {
        address: "bad@anncoach.com",
        source: "website",
        status: null,
        verification: "invalid",
      },
    ]);
    expect(rows.every((row) => row.verifiedAt !== null)).toBe(true);
    expect(await itemRow(db, run.runId, lead.leadId)).toMatchObject({
      status: "processed",
    });
    expect(await runRow(db, run.runId)).toMatchObject({
      status: "done",
      processed: 1,
      failed: 0,
    });
  });
});

test("a malformed address is recorded invalid without ever being sent to the paid verifier", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, queue, fake } = await boot(db, pool);
    const { lead, job } = await seedLead(context, db, [
      { address: "//www.tiktok.com/@linktr.ee" },
      { address: "ann@anncoach.com" },
    ]);

    await queue.deliver(job);

    expect(fake.calls).toEqual([["ann@anncoach.com"]]);
    expect(await emailRows(db, lead.leadId)).toMatchObject([
      { address: "//www.tiktok.com/@linktr.ee", verification: "invalid" },
      { address: "ann@anncoach.com", verification: "valid" },
    ]);
  });
});

test("a lead whose only emails are malformed makes no verifier call at all", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, queue, fake } = await boot(db, pool);
    const { lead, run, job } = await seedLead(context, db, [
      { address: "//www.tiktok.com/@linktr.ee" },
    ]);

    await queue.deliver(job);

    expect(fake.calls).toEqual([]);
    expect(await emailRows(db, lead.leadId)).toMatchObject([
      { verification: "invalid" },
    ]);
    expect(await runRow(db, run.runId)).toMatchObject({
      status: "done",
      processed: 1,
    });
  });
});

test("a verdict of unknown is stored as unknown, not guessed", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, queue } = await boot(db, pool, () => "unknown");
    const { lead, job } = await seedLead(context, db, [
      { address: "ann@anncoach.com" },
    ]);

    await queue.deliver(job);

    const [row] = await emailRows(db, lead.leadId);
    expect(row?.verification).toBe("unknown");
    expect(row?.verifiedAt).not.toBeNull();
  });
});

test("a lead without emails is finished without calling the paid verifier", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, queue, fake } = await boot(db, pool);
    const { run, job } = await seedLead(context, db, []);

    await queue.deliver(job);

    expect(fake.calls).toEqual([]);
    expect(await runRow(db, run.runId)).toMatchObject({
      status: "done",
      processed: 1,
      failed: 0,
    });
  });
});

test("a lead deleted before its job runs is counted as processed without calling the verifier", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, queue, fake } = await boot(db, pool);
    const { lead, run, job } = await seedLead(context, db, [
      { address: "ann@anncoach.com" },
    ]);
    await context.repositories.lead.removeByLeadId({ leadId: lead.leadId });

    await queue.deliver(job);

    expect(fake.calls).toEqual([]);
    expect(await runRow(db, run.runId)).toMatchObject({
      status: "done",
      processed: 1,
    });
  });
});

test("delivering the same job twice pays for one verification and keeps the first result", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, queue, fake } = await boot(db, pool);
    const { lead, job } = await seedLead(context, db, [
      { address: "ann@anncoach.com" },
    ]);

    await queue.deliver(job);
    const [first] = await emailRows(db, lead.leadId);
    await queue.deliver(job);

    expect(fake.calls).toHaveLength(1);
    const [second] = await emailRows(db, lead.leadId);
    expect(second?.verifiedAt).toEqual(first?.verifiedAt ?? null);
  });
});

test("verifying one lead never touches another lead holding the same address", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, queue } = await boot(db, pool);
    const ann = await seedLead(context, db, [{ address: "shared@coach.com" }]);
    const bob = await context.repositories.lead.create({
      name: "Bob",
      username: "bob",
      skoolUrl: `${SKOOL}/@bob`,
    });
    await context.repositories.leadEmail.addMany({
      leadId: bob.leadId,
      addresses: ["shared@coach.com"],
      source: "manual",
    });

    await queue.deliver(ann.job);

    expect(await emailRows(db, ann.lead.leadId)).toMatchObject([
      { verification: "valid" },
    ]);
    expect(await emailRows(db, bob.leadId)).toMatchObject([
      { verification: null, verifiedAt: null },
    ]);
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
    name: "a retryable verifier error is retried, not counted",
    error: () =>
      new EmailVerifierError({ message: "Apify is busy", retryable: true }),
    isFinalAttempt: false,
    expectedError: EmailVerifierError,
    counted: false,
  },
  {
    name: "a retryable verifier error on the final attempt is counted as failed",
    error: () =>
      new EmailVerifierError({ message: "Apify is busy", retryable: true }),
    isFinalAttempt: true,
    expectedError: EmailVerifierError,
    counted: true,
  },
  {
    name: "a non-retryable verifier error is counted as failed at once",
    error: () =>
      new EmailVerifierError({ message: "bad token", retryable: false }),
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
  test(`failure: ${scenario.name}, and no email is marked verified`, async () => {
    await withTestDatabase(async ({ db, pool }) => {
      const { context, queue } = await boot(db, pool, () => {
        throw scenario.error();
      });
      const { lead, run, job } = await seedLead(context, db, [
        { address: "ann@anncoach.com" },
      ]);

      await expect(
        queue.deliver(job, { isFinalAttempt: scenario.isFinalAttempt }),
      ).rejects.toBeInstanceOf(scenario.expectedError);

      expect(await emailRows(db, lead.leadId)).toMatchObject([
        { verification: null, verifiedAt: null },
      ]);
      expect(await runRow(db, run.runId)).toMatchObject(
        scenario.counted
          ? { status: "done", processed: 0, failed: 1 }
          : { status: "running", processed: 0, failed: 0 },
      );
      const items = await db
        .select()
        .from(pipelineItemsTable)
        .where(eq(pipelineItemsTable.runId, run.runId));
      expect(items.map((item) => item.status)).toEqual(
        scenario.counted ? ["failed"] : [],
      );
    });
  });
}

test("a failed item keeps the verifier's own message", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, queue } = await boot(db, pool, () => {
      throw new EmailVerifierError({
        message: "Apify answered HTTP 402: not enough credit",
        retryable: false,
      });
    });
    const { lead, run, job } = await seedLead(context, db, [
      { address: "ann@anncoach.com" },
    ]);

    await expect(queue.deliver(job)).rejects.toBeInstanceOf(
      NonRetryableJobError,
    );

    expect((await itemRow(db, run.runId, lead.leadId)).error).toBe(
      "Apify answered HTTP 402: not enough credit",
    );
  });
});

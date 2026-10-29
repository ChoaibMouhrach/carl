import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import z from "zod";
import { initENV } from "@server/config/env";
import type { DB } from "@server/infrastructure/database/client";
import { FullEnrichContactEnrichment } from "@server/infrastructure/contact-enrichment/fullenrich";
import {
  leadsTable,
  pipelineItemsTable,
  pipelineRunsTable,
  type LeadInsert,
} from "@server/infrastructure/database/schemas";
import {
  ContactEnrichmentError,
  type BaseContactEnrichment,
  type ContactEmail,
  type ContactEnrichmentInput,
  type ContactEnrichmentResult,
} from "@server/lib/base-contact-enrichment";
import {
  NonRetryableJobError,
  type FullEnrichJob,
} from "@server/lib/base-queue";
import { FullEnrichWorker } from "@server/workers/fullenrich";
import { createContext } from "./helpers/context";
import { withTestDatabase } from "./helpers/http";
import {
  FakeContactEnrichment,
  ManualQueue,
  insertCampaign,
  insertRun,
} from "./helpers/pipeline";

type Pool = Parameters<typeof createContext>[1];

const SKOOL = "https://www.skool.com";

const email = (address: string): ContactEmail => ({
  address,
  status: "DELIVERABLE",
});

const noEmails: ContactEnrichmentResult = {
  workEmail: null,
  personalEmail: null,
};

const boot = async (
  db: DB,
  pool: Pool,
  respond?: (input: ContactEnrichmentInput) => ContactEnrichmentResult,
  provider?: BaseContactEnrichment,
) => {
  const context = createContext(db, pool, initENV());
  const queue = new ManualQueue<FullEnrichJob>();
  const fake = new FakeContactEnrichment(respond);
  context.queueHub.fullenrich = queue;
  context.contactEnrichment = provider ?? fake;
  await new FullEnrichWorker({ context }).run();

  return { context, queue, fake };
};

const fullenrichJob = (runId: number, leadId: number): FullEnrichJob => ({
  type: "fullenrich-lead",
  runId,
  leadId,
});

const seedLead = async (
  context: ReturnType<typeof createContext>,
  db: DB,
  values: Partial<LeadInsert> = {},
) => {
  const campaign = await insertCampaign(db);
  const run = await insertRun(db, {
    campaignId: campaign.campaignId,
    step: "fullenrich",
    total: 1,
  });
  const lead = await context.repositories.lead.create({
    name: "Ann Coach",
    username: "anncoach",
    skoolUrl: `${SKOOL}/@anncoach`,
    website: "https://anncoach.com",
    ...values,
  });
  await context.repositories.campaign.addLeads({
    campaignId: campaign.campaignId,
    leadIds: [lead.leadId],
  });

  return { campaign, run, lead, job: fullenrichJob(run.runId, lead.leadId) };
};

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

  if (!row) {
    throw new Error(`Item for lead ${leadId} in run ${runId} is missing.`);
  }

  return row;
};

test("a lead's work and personal emails are stored on the lead and on the run item, and the run finishes", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, queue, fake } = await boot(db, pool, () => ({
      workEmail: email("ann@anncoach.com"),
      personalEmail: email("ann@gmail.com"),
    }));
    const { lead, run, job } = await seedLead(context, db, {
      linkedin: "https://www.linkedin.com/in/anncoach",
    });

    await queue.deliver(job);

    expect(fake.inputs).toEqual([
      {
        firstName: "Ann",
        lastName: "Coach",
        domain: "anncoach.com",
        linkedinUrl: "https://www.linkedin.com/in/anncoach",
      },
    ]);
    const stored = await leadRow(db, lead.leadId);
    expect(stored.workEmail).toBe("ann@anncoach.com");
    expect(stored.personalEmail).toBe("ann@gmail.com");
    expect(stored.emailEnrichedAt).toBeInstanceOf(Date);
    expect(await itemRow(db, run.runId, lead.leadId)).toMatchObject({
      status: "processed",
      leadId: lead.leadId,
      workEmail: "ann@anncoach.com",
      personalEmail: "ann@gmail.com",
    });
    expect(await runRow(db, run.runId)).toMatchObject({
      status: "done",
      total: 1,
      processed: 1,
      failed: 0,
    });
  });
});

test("only a work email found leaves the personal email empty", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, queue } = await boot(db, pool, () => ({
      workEmail: email("ann@anncoach.com"),
      personalEmail: null,
    }));
    const { lead, run, job } = await seedLead(context, db);

    await queue.deliver(job);

    const stored = await leadRow(db, lead.leadId);
    expect(stored.workEmail).toBe("ann@anncoach.com");
    expect(stored.personalEmail).toBeNull();
    expect(await itemRow(db, run.runId, lead.leadId)).toMatchObject({
      workEmail: "ann@anncoach.com",
      personalEmail: null,
    });
  });
});

test("finding no email still finishes the lead and stamps when it was looked up", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, queue } = await boot(db, pool, () => noEmails);
    const { lead, run, job } = await seedLead(context, db);

    await queue.deliver(job);

    const stored = await leadRow(db, lead.leadId);
    expect(stored).toMatchObject({ workEmail: null, personalEmail: null });
    expect(stored.emailEnrichedAt).toBeInstanceOf(Date);
    expect(await itemRow(db, run.runId, lead.leadId)).toMatchObject({
      status: "processed",
      workEmail: null,
      personalEmail: null,
    });
    expect(await runRow(db, run.runId)).toMatchObject({
      status: "done",
      processed: 1,
    });
  });
});

const inputCases: {
  name: string;
  lead: Partial<LeadInsert>;
  expected: ContactEnrichmentInput;
}[] = [
  {
    name: "a website with www and a path becomes a bare domain",
    lead: { website: "https://www.anncoach.com/about" },
    expected: { firstName: "Ann", lastName: "Coach", domain: "anncoach.com" },
  },
  {
    name: "a website without a scheme still yields its domain",
    lead: { website: "anncoach.com" },
    expected: { firstName: "Ann", lastName: "Coach", domain: "anncoach.com" },
  },
  {
    name: "everything after the first name is the last name",
    lead: { name: "Ann Marie Coach" },
    expected: {
      firstName: "Ann",
      lastName: "Marie Coach",
      domain: "anncoach.com",
    },
  },
  {
    name: "extra whitespace in the name is ignored",
    lead: { name: "  Ann   Coach " },
    expected: { firstName: "Ann", lastName: "Coach", domain: "anncoach.com" },
  },
  {
    name: "a LinkedIn-only lead sends no domain",
    lead: { website: null, linkedin: "https://www.linkedin.com/in/anncoach" },
    expected: {
      firstName: "Ann",
      lastName: "Coach",
      linkedinUrl: "https://www.linkedin.com/in/anncoach",
    },
  },
  {
    name: "an unparseable website is dropped and the LinkedIn profile carries the lookup",
    lead: {
      website: "http://",
      linkedin: "https://www.linkedin.com/in/anncoach",
    },
    expected: {
      firstName: "Ann",
      lastName: "Coach",
      linkedinUrl: "https://www.linkedin.com/in/anncoach",
    },
  },
];

for (const scenario of inputCases) {
  test(`provider input: ${scenario.name}`, async () => {
    await withTestDatabase(async ({ db, pool }) => {
      const { context, queue, fake } = await boot(db, pool, () => noEmails);
      const { job } = await seedLead(context, db, scenario.lead);

      await queue.deliver(job);

      expect(fake.inputs).toEqual([scenario.expected]);
    });
  });
}

const rerunCases: {
  name: string;
  found: ContactEnrichmentResult;
  expectedLead: { workEmail: string; personalEmail: string };
  expectedItem: { workEmail: string | null; personalEmail: string | null };
}[] = [
  {
    name: "a re-run that finds nothing keeps the emails the lead already has",
    found: noEmails,
    expectedLead: { workEmail: "old@work.com", personalEmail: "old@home.com" },
    expectedItem: { workEmail: null, personalEmail: null },
  },
  {
    name: "a new work email replaces only the work email",
    found: { workEmail: email("new@work.com"), personalEmail: null },
    expectedLead: { workEmail: "new@work.com", personalEmail: "old@home.com" },
    expectedItem: { workEmail: "new@work.com", personalEmail: null },
  },
];

for (const scenario of rerunCases) {
  test(`re-run: ${scenario.name}`, async () => {
    await withTestDatabase(async ({ db, pool }) => {
      const { context, queue } = await boot(db, pool, () => scenario.found);
      const { lead, run, job } = await seedLead(context, db, {
        workEmail: "old@work.com",
        personalEmail: "old@home.com",
      });

      await queue.deliver(job);

      const stored = await leadRow(db, lead.leadId);
      expect({
        workEmail: stored.workEmail,
        personalEmail: stored.personalEmail,
      }).toEqual(scenario.expectedLead);
      expect(stored.emailEnrichedAt).toBeInstanceOf(Date);
      const item = await itemRow(db, run.runId, lead.leadId);
      expect({
        workEmail: item.workEmail,
        personalEmail: item.personalEmail,
      }).toEqual(scenario.expectedItem);
    });
  });
}

test("a lead FullEnrich cannot look up is failed at once with the reason, and stays untouched", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    // The real client rejects this input before it makes any network call.
    const provider = new FullEnrichContactEnrichment({ apiKey: "unused" });
    const { context, queue } = await boot(db, pool, undefined, provider);
    const { lead, run, job } = await seedLead(context, db, {
      name: "Cher",
      website: null,
      linkedin: null,
    });

    await expect(queue.deliver(job)).rejects.toBeInstanceOf(
      NonRetryableJobError,
    );

    const item = await itemRow(db, run.runId, lead.leadId);
    expect(item.status).toBe("failed");
    expect(item.error).toContain("last name");
    expect(item.error).toContain("domain or company name");
    const stored = await leadRow(db, lead.leadId);
    expect(stored.emailEnrichedAt).toBeNull();
    expect(stored).toMatchObject({ workEmail: null, personalEmail: null });
    expect(await runRow(db, run.runId)).toMatchObject({
      status: "done",
      processed: 0,
      failed: 1,
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
    name: "a retryable provider error is retried, not counted",
    error: () =>
      new ContactEnrichmentError({ message: "rate limited", retryable: true }),
    isFinalAttempt: false,
    expectedError: ContactEnrichmentError,
    counted: false,
  },
  {
    name: "a retryable provider error on the final attempt is counted as failed",
    error: () =>
      new ContactEnrichmentError({ message: "rate limited", retryable: true }),
    isFinalAttempt: true,
    expectedError: ContactEnrichmentError,
    counted: true,
  },
  {
    name: "a non-retryable provider error is counted as failed at once",
    error: () =>
      new ContactEnrichmentError({ message: "bad key", retryable: false }),
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
      expect(stored.emailEnrichedAt).toBeNull();
      expect(stored).toMatchObject({ workEmail: null, personalEmail: null });
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

test("a failed item keeps the provider's own message", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, queue } = await boot(db, pool, () => {
      throw new ContactEnrichmentError({
        message: "FullEnrich account is out of credits",
        retryable: false,
      });
    });
    const { lead, run, job } = await seedLead(context, db);

    await expect(queue.deliver(job)).rejects.toBeInstanceOf(
      NonRetryableJobError,
    );

    expect((await itemRow(db, run.runId, lead.leadId)).error).toBe(
      "FullEnrich account is out of credits",
    );
  });
});

test("a lead deleted before its job runs is counted as processed without calling the provider", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, queue, fake } = await boot(db, pool);
    const { lead, run, job } = await seedLead(context, db);
    await db.delete(leadsTable).where(eq(leadsTable.leadId, lead.leadId));

    await queue.deliver(job);

    expect(fake.inputs).toHaveLength(0);
    expect(await runRow(db, run.runId)).toMatchObject({
      status: "done",
      processed: 1,
      failed: 0,
    });
  });
});

test("delivering the same job twice calls the provider once and leaves the finished item as it was", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, queue, fake } = await boot(db, pool, () => ({
      workEmail: email("ann@anncoach.com"),
      personalEmail: null,
    }));
    const { lead, run, job } = await seedLead(context, db);

    await queue.deliver(job);
    await queue.deliver(job);

    expect(fake.inputs).toHaveLength(1);
    expect(await itemRow(db, run.runId, lead.leadId)).toMatchObject({
      status: "processed",
      workEmail: "ann@anncoach.com",
    });
    expect(await runRow(db, run.runId)).toMatchObject({
      status: "done",
      processed: 1,
      failed: 0,
    });
  });
});

test("a run with found, failed and empty leads ends done once every lead is accounted for", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, queue } = await boot(db, pool, (input) => {
      if (input.firstName === "Broken") {
        throw new ContactEnrichmentError({
          message: "bad input",
          retryable: false,
        });
      }

      return input.firstName === "Ann"
        ? { workEmail: email("ann@anncoach.com"), personalEmail: null }
        : noEmails;
    });
    const campaign = await insertCampaign(db);
    const run = await insertRun(db, {
      campaignId: campaign.campaignId,
      step: "fullenrich",
      total: 3,
    });
    const leads = [];
    for (const name of ["Ann Coach", "Broken Lead", "Cat Coach"]) {
      const username = name.split(" ")[0]!.toLowerCase();
      leads.push(
        await context.repositories.lead.create({
          name,
          username,
          skoolUrl: `${SKOOL}/@${username}`,
          website: `https://${username}.com`,
        }),
      );
    }

    const [found, broken, empty] = leads;
    if (!found || !broken || !empty)
      throw new Error("Seeded leads are missing.");
    await queue.deliver(fullenrichJob(run.runId, found.leadId));
    await expect(
      queue.deliver(fullenrichJob(run.runId, broken.leadId)),
    ).rejects.toBeInstanceOf(NonRetryableJobError);
    await queue.deliver(fullenrichJob(run.runId, empty.leadId));

    expect(await runRow(db, run.runId)).toMatchObject({
      status: "done",
      total: 3,
      processed: 2,
      failed: 1,
      error: null,
    });
    const emails = await Promise.all(
      leads.map(async (lead) => (await leadRow(db, lead.leadId)).workEmail),
    );
    expect(emails).toEqual(["ann@anncoach.com", null, null]);
  });
});

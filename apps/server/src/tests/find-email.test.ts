import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import z from "zod";
import { initENV } from "@server/config/env";
import {
  campaignLeadsTable,
  leadsTable,
  type LeadInsert,
} from "@server/infrastructure/database/schemas";
import { Services } from "@server/services";
import { createAdminClient, seedLead } from "./helpers/api";
import {
  createContext,
  FakeEmailFinder,
  TestLogger,
  TestMailer,
} from "./helpers/context";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";

type Database = Parameters<Parameters<typeof withTestDatabase>[0]>[0];

const setup = async (
  { db, pool }: Database,
  input: {
    leads?: Partial<LeadInsert>[];
    status?: "active" | "draft";
  } = {},
  envOverride: Partial<ReturnType<typeof initENV>> = {},
) => {
  const emailFinder = new FakeEmailFinder();
  const context = createContext(
    db,
    pool,
    { ...initENV(), ...envOverride },
    new TestMailer(),
    undefined,
    undefined,
    undefined,
    undefined,
    emailFinder,
  );
  const admin = await createAdminClient(context, "finder-admin@example.com");
  const campaign = await context.repositories.campaign.create({
    name: "Finder",
    keywords: ["coaching"],
    types: ["public"],
    pricingModels: ["paid"],
    status: input.status ?? "active",
  });
  const specs = input.leads ?? [
    { linkedinUrl: "https://www.linkedin.com/in/jane-0" },
    { linkedinUrl: "https://www.linkedin.com/in/jane-1" },
    { website: "https://www.example.com/about" },
  ];
  const leads = [];
  for (const [index, spec] of specs.entries()) {
    leads.push(
      await seedLead(context, {
        skoolUsername: `finder-${index}`,
        name: `Jane Doe${index}`,
        ...spec,
      }),
    );
  }
  await context.repositories.campaignLead.attach({
    campaignId: campaign.campaignId,
    leads: leads.map((lead) => ({ leadId: lead.leadId, keyword: "coaching" })),
    stage: 3,
    status: "done",
  });

  return {
    emailFinder,
    context,
    admin,
    campaign,
    leads,
    services: new Services({ context }),
    path: `/api/campaigns/${campaign.campaignId}`,
  };
};

const rowOf = async (db: Database["db"], campaignId: number, leadId: number) =>
  (
    await db
      .select()
      .from(campaignLeadsTable)
      .where(eq(campaignLeadsTable.leadId, leadId))
  ).find((row) => row.campaignId === campaignId);

const leadOf = async (db: Database["db"], leadId: number) =>
  (await db.select().from(leadsTable).where(eq(leadsTable.leadId, leadId)))[0];

const run = async (services: Services, campaign: { campaignId: number }) => {
  await services.findEmail.start({ campaignId: campaign.campaignId });
  await services.findEmail.runCampaign({ campaignId: campaign.campaignId });
};

test("starting moves the leads that have a LinkedIn or website to stage 4, queues one job and refuses a second start while it runs", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, campaign, leads, context } = await setup(database);
    context.eventBus.published.length = 0;

    const started = await admin.post(`${path}/find-email/run`);

    expect(started.status).toBe(202);
    expect(
      z.object({ queued: z.number() }).parse(await started.json()).queued,
    ).toBe(3);
    for (const lead of leads) {
      expect(
        await rowOf(database.db, campaign.campaignId, lead.leadId),
      ).toMatchObject({ stage: 4, status: "pending" });
    }
    expect((await context.queueHub.findEmail.getCounts()).completed).toBe(1);
    expect(context.eventBus.published).toContain("campaigns.changed");

    await database.db
      .update(campaignLeadsTable)
      .set({ status: "running" })
      .where(eq(campaignLeadsTable.leadId, leads[0]?.leadId ?? 0));
    context.queueHub.findEmail.unfinished.push({
      campaignId: campaign.campaignId,
    });
    const again = await admin.post(`${path}/find-email/run`);
    expect(again.status).toBe(409);
    expect((await context.queueHub.findEmail.getCounts()).completed).toBe(1);
  });
});

test("leads the web search found nothing for stay at stage 3 and are not looked up", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, campaign, leads } = await setup(database);
    const nothing = leads[0];
    await database.db
      .update(campaignLeadsTable)
      .set({ status: "failed", failureReason: "Nothing found" })
      .where(eq(campaignLeadsTable.leadId, nothing?.leadId ?? 0));

    const started = await admin.post(`${path}/find-email/run`);

    expect(started.status).toBe(202);
    expect(
      z.object({ queued: z.number() }).parse(await started.json()).queued,
    ).toBe(2);
    expect(
      await rowOf(database.db, campaign.campaignId, nothing?.leadId ?? 0),
    ).toMatchObject({
      stage: 3,
      status: "failed",
      failureReason: "Nothing found",
    });
  });
});

test("a campaign that is not active, does not exist or has nobody waiting cannot start, and nothing moves", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, context, campaign, leads } = await setup(database);
    const statusOf = async () =>
      (await admin.post(`${path}/find-email/run`)).status;
    const stagesOf = async () =>
      (await database.db.select().from(campaignLeadsTable)).map(
        (row) => row.stage,
      );

    await context.repositories.campaign.update(
      { campaignId: campaign.campaignId },
      { status: "draft" },
    );
    expect(await statusOf()).toBe(400);
    expect(await stagesOf()).toEqual(leads.map(() => 3));

    await context.repositories.campaign.update(
      { campaignId: campaign.campaignId },
      { status: "active" },
    );
    await database.db.update(campaignLeadsTable).set({ stage: 2 });
    expect(await statusOf()).toBe(400);
    expect(await stagesOf()).toEqual(leads.map(() => 2));

    expect(
      (await admin.post("/api/campaigns/999999/find-email/run")).status,
    ).toBe(404);
    expect((await context.queueHub.findEmail.getCounts()).completed).toBe(0);
  });
});

test("only an admin can start the email search", async () => {
  await withTestDatabase(async (database) => {
    const { path, context } = await setup(database);
    const member = await createAuthenticatedApp({
      context,
      email: "finder-member@example.com",
    });

    const anonymous = await member.app.request(`${path}/find-email/run`, {
      method: "POST",
    });
    const refused = await member.app.request(`${path}/find-email/run`, {
      method: "POST",
      headers: { cookie: member.cookie },
    });

    expect([anonymous.status, refused.status]).toEqual([401, 403]);
    expect(
      await database.db.$count(
        campaignLeadsTable,
        eq(campaignLeadsTable.stage, 4),
      ),
    ).toBe(0);
  });
});

test("every lead goes to the provider in one call with everything known about it, and a found email is saved in lower case", async () => {
  await withTestDatabase(async (database) => {
    const { services, campaign, leads, emailFinder } = await setup(database, {
      leads: [
        { linkedinUrl: "https://www.linkedin.com/in/jane-0" },
        { website: "https://www.example.com/about?x=1" },
        {
          linkedinUrl: "https://www.linkedin.com/in/jane-2",
          website: "https://coach.example.org",
        },
      ],
    });
    emailFinder.answer = (lookup) =>
      lookup.linkedinUrl ? "Jane@Example.COM" : "site@example.com";

    await run(services, campaign);

    expect(emailFinder.calls).toHaveLength(1);
    expect(
      emailFinder.calls[0]?.map(({ key: _key, ...lookup }) => lookup),
    ).toEqual([
      {
        firstName: "Jane",
        lastName: "Doe0",
        domain: null,
        linkedinUrl: "https://www.linkedin.com/in/jane-0",
      },
      {
        firstName: "Jane",
        lastName: "Doe1",
        domain: "example.com",
        linkedinUrl: null,
      },
      {
        firstName: "Jane",
        lastName: "Doe2",
        domain: "coach.example.org",
        linkedinUrl: "https://www.linkedin.com/in/jane-2",
      },
    ]);
    const saved = [];
    for (const lead of leads) {
      saved.push([
        (await leadOf(database.db, lead.leadId))?.emails,
        (await rowOf(database.db, campaign.campaignId, lead.leadId))?.status,
      ]);
    }
    expect(saved).toEqual([
      [["jane@example.com"], "done"],
      [["site@example.com"], "done"],
      [["jane@example.com"], "done"],
    ]);
  });
});

test("a lead with no LinkedIn and no usable name or website fails with the reason without being sent to the provider", async () => {
  await withTestDatabase(async (database) => {
    const { services, campaign, leads, emailFinder } = await setup(database, {
      leads: [
        { name: "Madonna", website: "https://example.com" },
        { name: "Jane Doe", website: "https://linktr.ee/jane" },
        { name: "Jane Doe", website: "https://example.com" },
      ],
    });
    emailFinder.answer = () => "ok@example.com";

    await run(services, campaign);

    expect(emailFinder.calls.flat()).toHaveLength(1);
    const rows = [];
    for (const lead of leads) {
      const row = await rowOf(database.db, campaign.campaignId, lead.leadId);
      rows.push([
        row?.status,
        row?.failureReason,
        (await leadOf(database.db, lead.leadId))?.emails,
      ]);
    }
    expect(rows).toEqual([
      ["failed", "No usable name", []],
      ["failed", "No usable website", []],
      ["done", null, ["ok@example.com"]],
    ]);
  });
});

test("a lead that already has an email is done without a paid lookup and keeps its emails", async () => {
  await withTestDatabase(async (database) => {
    const { services, campaign, leads, emailFinder } = await setup(database, {
      leads: [
        {
          linkedinUrl: "https://www.linkedin.com/in/known",
          emails: ["bio@example.com"],
        },
      ],
    });

    await run(services, campaign);

    const lead = leads[0];
    expect(emailFinder.calls).toEqual([]);
    expect((await leadOf(database.db, lead?.leadId ?? 0))?.emails).toEqual([
      "bio@example.com",
    ]);
    expect(
      await rowOf(database.db, campaign.campaignId, lead?.leadId ?? 0),
    ).toMatchObject({ stage: 4, status: "done", failureReason: null });
  });
});

test("a lead with no email found fails with the reason, is left unchanged and is not looked up again on the next start", async () => {
  await withTestDatabase(async (database) => {
    const { services, admin, path, campaign, leads, emailFinder } = await setup(
      database,
      {
        leads: [{ linkedinUrl: "https://www.linkedin.com/in/jane-0" }],
      },
    );
    await run(services, campaign);

    const lead = leads[0];
    expect(
      await rowOf(database.db, campaign.campaignId, lead?.leadId ?? 0),
    ).toMatchObject({
      stage: 4,
      status: "failed",
      failureReason: "No email found",
    });
    expect((await leadOf(database.db, lead?.leadId ?? 0))?.emails).toEqual([]);

    const again = await admin.post(`${path}/find-email/run`);

    expect(again.status).toBe(400);
    expect(emailFinder.calls).toHaveLength(1);
    expect(
      await rowOf(database.db, campaign.campaignId, lead?.leadId ?? 0),
    ).toMatchObject({ status: "failed", failureReason: "No email found" });
  });
});

test("leads with the same LinkedIn or name and domain are paid for once and all get the email", async () => {
  await withTestDatabase(async (database) => {
    const { services, campaign, leads, emailFinder } = await setup(database, {
      leads: [
        { name: "Jane Doe", linkedinUrl: "https://www.linkedin.com/in/same" },
        { name: "JANE DOE", linkedinUrl: "https://www.linkedin.com/in/same" },
        { name: "Jane Doe", linkedinUrl: "https://www.linkedin.com/in/other" },
      ],
    });
    emailFinder.answer = (lookup) =>
      lookup.linkedinUrl?.endsWith("same") ? "same@example.com" : null;

    await run(services, campaign);

    expect(emailFinder.calls.flat()).toHaveLength(2);
    const emails = [];
    for (const lead of leads) {
      emails.push((await leadOf(database.db, lead.leadId))?.emails);
    }
    expect(emails).toEqual([["same@example.com"], ["same@example.com"], []]);
  });
});

test("leads are sent in batches of 100, two batches at a time", async () => {
  await withTestDatabase(async (database) => {
    const { services, campaign, leads, emailFinder } = await setup(database, {
      leads: Array.from({ length: 250 }, (_, index) => ({
        linkedinUrl: `https://www.linkedin.com/in/batch-${index}`,
      })),
    });
    emailFinder.delayMs = 30;
    emailFinder.answer = (lookup) =>
      `${lookup.linkedinUrl?.split("/").at(-1)}@example.com`;

    await run(services, campaign);

    expect(
      emailFinder.calls.map((call) => call.length).toSorted((a, b) => a - b),
    ).toEqual([50, 100, 100]);
    expect(emailFinder.peakInFlight).toBe(2);
    expect(
      await database.db.$count(
        campaignLeadsTable,
        eq(campaignLeadsTable.status, "done"),
      ),
    ).toBe(leads.length);
  });
});

test("a batch the provider fails on is marked failed with the message, the other batches are unaffected, and the next start only tries the failed ones", async () => {
  await withTestDatabase(async (database) => {
    const { services, campaign, leads, emailFinder } = await setup(database, {
      leads: Array.from({ length: 101 }, (_, index) => ({
        linkedinUrl: `https://www.linkedin.com/in/retry-${index}`,
      })),
    });
    emailFinder.answer = () => "found@example.com";
    let failed = false;
    emailFinder.failWhen = (lookups) => {
      if (failed || lookups.length !== 100) return null;
      failed = true;

      return new Error("FullEnrich has no credits left.");
    };
    await run(services, campaign);

    const statuses = new Map<string, number>();
    for (const lead of leads) {
      const row = await rowOf(database.db, campaign.campaignId, lead.leadId);
      const label = `${row?.status}:${row?.failureReason ?? ""}`;
      statuses.set(label, (statuses.get(label) ?? 0) + 1);
    }
    expect(Object.fromEntries(statuses)).toEqual({
      "failed:FullEnrich has no credits left.": 100,
      "done:": 1,
    });
    const failedLeads = [];
    for (const lead of leads) {
      const row = await rowOf(database.db, campaign.campaignId, lead.leadId);
      if (row?.status === "failed") failedLeads.push(lead);
      expect((await leadOf(database.db, lead.leadId))?.emails).toEqual(
        row?.status === "done" ? ["found@example.com"] : [],
      );
    }

    const callsBefore = emailFinder.calls.length;
    const restarted = await services.findEmail.start({
      campaignId: campaign.campaignId,
    });
    await services.findEmail.runCampaign({ campaignId: campaign.campaignId });

    expect(restarted).toEqual({ queued: 100 });
    expect(emailFinder.calls.slice(callsBefore).flat()).toHaveLength(100);
    expect(
      await database.db.$count(
        campaignLeadsTable,
        eq(campaignLeadsTable.status, "done"),
      ),
    ).toBe(101);
    expect(failedLeads).toHaveLength(100);
  });
});

test("starting again after a run died leaves nothing stuck: the leads it left running are queued again and a new job is queued", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, campaign, leads, context } = await setup(database);
    await admin.post(`${path}/find-email/run`);
    await database.db
      .update(campaignLeadsTable)
      .set({ status: "running" })
      .where(eq(campaignLeadsTable.leadId, leads[0]?.leadId ?? 0));

    const again = await admin.post(`${path}/find-email/run`);

    expect(again.status).toBe(202);
    expect(z.object({ queued: z.number() }).parse(await again.json())).toEqual({
      queued: leads.length,
    });
    for (const lead of leads) {
      expect(
        await rowOf(database.db, campaign.campaignId, lead.leadId),
      ).toMatchObject({ stage: 4, status: "pending" });
    }
    expect((await context.queueHub.findEmail.getCounts()).completed).toBe(2);
  });
});

test("leads left running by a run that died are picked up again by the next run", async () => {
  await withTestDatabase(async (database) => {
    const { services, campaign, leads, emailFinder, context } =
      await setup(database);
    emailFinder.answer = () => "again@example.com";
    await services.findEmail.start({ campaignId: campaign.campaignId });
    await context.repositories.campaignLead.setStatus(
      { campaignId: campaign.campaignId, leadId: leads[0]?.leadId ?? 0 },
      { status: "running", failureReason: null },
    );

    await services.findEmail.runCampaign({ campaignId: campaign.campaignId });

    for (const lead of leads) {
      expect(
        await rowOf(database.db, campaign.campaignId, lead.leadId),
      ).toMatchObject({ stage: 4, status: "done" });
      expect((await leadOf(database.db, lead.leadId))?.emails).toEqual([
        "again@example.com",
      ]);
    }
    expect(emailFinder.calls.flat()).toHaveLength(3);
  });
});

test("the run is logged with the provider, the outcome counts and the reason for a failed batch", async () => {
  await withTestDatabase(async (database) => {
    const { services, campaign, emailFinder, context } = await setup(database, {
      leads: [
        { linkedinUrl: "https://www.linkedin.com/in/log-0" },
        { name: "Madonna", website: "https://example.com" },
        { name: "Jane Doe", emails: ["bio@example.com"] },
      ],
    });
    const logger = context.logger;
    if (!(logger instanceof TestLogger)) throw new Error("expected TestLogger");
    logger.records.length = 0;
    emailFinder.error = new Error("FullEnrich 500: boom");

    await run(services, campaign);

    expect(logger.records).toEqual([
      {
        level: "info",
        message: {
          message: "Email search queued.",
          campaignId: campaign.campaignId,
          queued: 3,
          emailFinder: "fake",
        },
      },
      {
        level: "info",
        message: {
          message: "Email search started.",
          campaignId: campaign.campaignId,
          leads: 3,
          recovered: 0,
          emailFinder: "fake",
        },
      },
      {
        level: "warn",
        message: {
          message: "Email search failed for a batch.",
          campaignId: campaign.campaignId,
          leads: 1,
          reason: "FullEnrich 500: boom",
        },
      },
      {
        level: "info",
        message: {
          message: "Email batch updated.",
          campaignId: campaign.campaignId,
          batchId: expect.any(String),
          state: "failed",
          found: 0,
          nothing: 0,
          failed: 1,
        },
      },
      {
        level: "info",
        message: {
          message: "Email search handed to the provider.",
          campaignId: campaign.campaignId,
          outcomes: { skipped: 1, known: 1, error: 1 },
        },
      },
    ]);
  });
});

test("leads that failed for a reason that will not change stay failed on the next start, while one that failed on a provider error is queued again", async () => {
  await withTestDatabase(async (database) => {
    const { services, admin, path, campaign, leads, emailFinder } = await setup(
      database,
      {
        leads: [
          { linkedinUrl: "https://www.linkedin.com/in/r-0" },
          { linkedinUrl: "https://www.linkedin.com/in/r-1" },
          { linkedinUrl: "https://www.linkedin.com/in/r-2" },
          { linkedinUrl: "https://www.linkedin.com/in/r-3" },
        ],
      },
    );
    await services.findEmail.start({ campaignId: campaign.campaignId });
    const reasons = [
      "No email found",
      "No usable name",
      "No usable website",
      "FullEnrich 500: boom",
    ];
    for (const [index, lead] of leads.entries()) {
      await database.db
        .update(campaignLeadsTable)
        .set({ status: "failed", failureReason: reasons[index] })
        .where(eq(campaignLeadsTable.leadId, lead.leadId));
    }
    emailFinder.answer = () => "again@example.com";

    const restarted = await admin.post(`${path}/find-email/run`);
    await services.findEmail.runCampaign({ campaignId: campaign.campaignId });

    expect(restarted.status).toBe(202);
    const rows = [];
    for (const lead of leads) {
      const row = await rowOf(database.db, campaign.campaignId, lead.leadId);
      rows.push([row?.status, row?.failureReason]);
    }
    expect(rows).toEqual([
      ["failed", "No email found"],
      ["failed", "No usable name"],
      ["failed", "No usable website"],
      ["done", null],
    ]);
    expect(emailFinder.calls.flat()).toHaveLength(1);
    expect((await leadOf(database.db, leads[3]?.leadId ?? 0))?.emails).toEqual([
      "again@example.com",
    ]);
    expect((await leadOf(database.db, leads[0]?.leadId ?? 0))?.emails).toEqual(
      [],
    );
  });
});

test("a run only looks up the leads of its own campaign", async () => {
  await withTestDatabase(async (database) => {
    const { services, campaign, context, emailFinder } = await setup(database, {
      leads: [{ linkedinUrl: "https://www.linkedin.com/in/mine" }],
    });
    emailFinder.answer = () => "mine@example.com";
    const other = await context.repositories.campaign.create({
      name: "Other",
      keywords: ["coaching"],
      types: ["public"],
      pricingModels: ["paid"],
      status: "active",
    });
    const stranger = await seedLead(context, {
      skoolUsername: "stranger",
      name: "Sam Stranger",
      linkedinUrl: "https://www.linkedin.com/in/stranger",
    });
    await context.repositories.campaignLead.attach({
      campaignId: other.campaignId,
      leads: [{ leadId: stranger.leadId, keyword: "coaching" }],
      stage: 4,
      status: "pending",
    });

    await run(services, campaign);

    expect(
      emailFinder.calls.flat().map((lookup) => lookup.linkedinUrl),
    ).toEqual(["https://www.linkedin.com/in/mine"]);
    expect(
      await rowOf(database.db, other.campaignId, stranger.leadId),
    ).toMatchObject({ stage: 4, status: "pending", failureReason: null });
    expect((await leadOf(database.db, stranger.leadId))?.emails).toEqual([]);
  });
});

test("the lead list shows the reason a lead failed and nothing for the others", async () => {
  await withTestDatabase(async (database) => {
    const { services, admin, path, campaign, leads, emailFinder } = await setup(
      database,
      {
        leads: [
          { linkedinUrl: "https://www.linkedin.com/in/found" },
          { linkedinUrl: "https://www.linkedin.com/in/missing" },
          { name: "Madonna", website: "https://example.com" },
        ],
      },
    );
    emailFinder.answer = (lookup) =>
      lookup.linkedinUrl?.endsWith("found") ? "found@example.com" : null;
    await run(services, campaign);

    const response = await admin.get(`${path}/leads?stage=4`);

    expect(response.status).toBe(200);
    const listed = z
      .object({
        leads: z.array(
          z.object({
            leadId: z.number(),
            status: z.string(),
            failureReason: z.string().nullable(),
            emails: z.array(z.string()),
          }),
        ),
      })
      .parse(await response.json());
    expect(
      Object.fromEntries(
        listed.leads.map((lead) => [
          lead.leadId,
          [lead.status, lead.failureReason, lead.emails],
        ]),
      ),
    ).toEqual({
      [leads[0]?.leadId ?? 0]: ["done", null, ["found@example.com"]],
      [leads[1]?.leadId ?? 0]: ["failed", "No email found", []],
      [leads[2]?.leadId ?? 0]: ["failed", "No usable name", []],
    });
    expect(
      (await rowOf(database.db, campaign.campaignId, leads[1]?.leadId ?? 0))
        ?.failureReason,
    ).toBe("No email found");
  });
});

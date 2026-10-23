import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import z from "zod";
import { initENV } from "@server/config/env";
import {
  campaignLeadsTable,
  emailEnrichmentsTable,
  leadAssessmentsTable,
  leadsTable,
  type LeadInsert,
} from "@server/infrastructure/database/schemas";
import { Services } from "@server/services";
import { sampleFilterQuestions } from "@server/testing/filter-questions";
import { createAdminClient, seedCommunity, seedLead } from "./helpers/api";
import {
  createContext,
  FakeEmailFinder,
  FakeLeadClassifier,
  FakeWebSearch,
  TestMailer,
} from "./helpers/context";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";

type Database = Parameters<Parameters<typeof withTestDatabase>[0]>[0];

interface Seeded {
  fields?: Partial<LeadInsert>;
  stage?: 1 | 2 | 3 | 4;
  status?: "pending" | "running" | "done" | "failed";
}

const setup = async (
  { db, pool }: Database,
  seeded: Seeded[],
  campaignStatus: "active" | "draft" = "active",
) => {
  const classifier = new FakeLeadClassifier();
  const webSearch = new FakeWebSearch();
  const emailFinder = new FakeEmailFinder();
  const context = createContext(
    db,
    pool,
    initENV(),
    new TestMailer(),
    undefined,
    undefined,
    classifier,
    webSearch,
    emailFinder,
  );
  const admin = await createAdminClient(context, "rerun-admin@example.com");
  const campaign = await context.repositories.campaign.create({
    name: "Rerun",
    keywords: ["coaching"],
    types: ["public"],
    pricingModels: ["paid"],
    status: campaignStatus,
  });
  await context.repositories.campaignFilter.replaceQuestions({
    campaignId: campaign.campaignId,
    questions: sampleFilterQuestions,
  });
  const leads = [];
  for (const [index, spec] of seeded.entries()) {
    const lead = await seedLead(context, {
      skoolUsername: `rerun-${index}`,
      name: `Jane Doe${index}`,
      bio: `Coach ${index}`,
      ...spec.fields,
    });
    await seedCommunity(context, lead.leadId, { displayName: `Club ${index}` });
    await context.repositories.campaignLead.attach({
      campaignId: campaign.campaignId,
      leads: [{ leadId: lead.leadId, keyword: "coaching" }],
      stage: spec.stage ?? 4,
      status: spec.status ?? "done",
    });
    leads.push(lead);
  }

  return {
    admin,
    campaign,
    classifier,
    context,
    emailFinder,
    leads,
    path: `/api/campaigns/${campaign.campaignId}/rerun`,
    webSearch,
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

const runWorkers = async (
  context: Parameters<typeof Services.prototype.constructor>[0]["context"],
  campaignId: number,
) => {
  const services = new Services({ context });

  await services.filter.runCampaign({ campaignId });
  await services.enrich.runCampaign({ campaignId });
  await services.findEmail.runCampaign({ campaignId });
};

const linkedin = (slug: string) => `https://www.linkedin.com/in/${slug}`;

const result = z.object({ queued: z.number(), skipped: z.number() });

test("re-running the email search sends the chosen leads even though they have emails, adds what is found to what they had, and leaves the other leads alone", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, campaign, leads, emailFinder, context } = await setup(
      database,
      [
        {
          fields: {
            linkedinUrl: "https://www.linkedin.com/in/a",
            emails: ["old@example.com"],
          },
        },
        {
          fields: {
            linkedinUrl: "https://www.linkedin.com/in/b",
            emails: ["bio@example.com"],
          },
        },
        {
          fields: {
            linkedinUrl: "https://www.linkedin.com/in/c",
            emails: ["other@example.com"],
          },
        },
      ],
    );
    emailFinder.answer = (lookup) =>
      lookup.linkedinUrl?.endsWith("/a") ? "New@Example.com" : null;
    const chosen = [leads[0], leads[1]].map((lead) => lead?.leadId ?? 0);

    const response = await admin.post(path, { stage: 4, leadIds: chosen });

    expect(response.status).toBe(202);
    await runWorkers(context, campaign.campaignId);
    expect(result.parse(await response.json())).toEqual({
      queued: 2,
      skipped: 0,
    });
    expect(
      emailFinder.calls.flat().map((lookup) => lookup.linkedinUrl),
    ).toEqual([
      "https://www.linkedin.com/in/a",
      "https://www.linkedin.com/in/b",
    ]);
    expect((await leadOf(database.db, chosen[0] ?? 0))?.emails).toEqual([
      "old@example.com",
      "new@example.com",
    ]);
    expect((await leadOf(database.db, chosen[1] ?? 0))?.emails).toEqual([
      "bio@example.com",
    ]);
    expect(
      await rowOf(database.db, campaign.campaignId, chosen[0] ?? 0),
    ).toMatchObject({
      stage: 4,
      status: "done",
      failureReason: null,
      rerun: false,
    });
    expect(
      await rowOf(database.db, campaign.campaignId, chosen[1] ?? 0),
    ).toMatchObject({
      stage: 4,
      status: "done",
      failureReason: null,
      rerun: false,
    });
    const untouched = await rowOf(
      database.db,
      campaign.campaignId,
      leads[2]?.leadId ?? 0,
    );
    expect(untouched).toMatchObject({ stage: 4, status: "done", rerun: false });
    expect((await leadOf(database.db, leads[2]?.leadId ?? 0))?.emails).toEqual([
      "other@example.com",
    ]);
  });
});

test("a lead re-run for emails that has none and finds none fails with no email found, while a normal run afterwards does not send it again", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, campaign, leads, emailFinder, context } = await setup(
      database,
      [
        {
          fields: { linkedinUrl: "https://www.linkedin.com/in/none" },
          stage: 4,
          status: "failed",
        },
      ],
    );
    const lead = leads[0];

    const response = await admin.post(path, {
      stage: 4,
      leadIds: [lead?.leadId ?? 0],
    });

    expect(response.status).toBe(202);
    await runWorkers(context, campaign.campaignId);
    expect(emailFinder.calls.flat()).toHaveLength(1);
    expect(
      await rowOf(database.db, campaign.campaignId, lead?.leadId ?? 0),
    ).toMatchObject({
      status: "failed",
      failureReason: "No email found",
      rerun: false,
    });

    const again = await admin.post(
      `/api/campaigns/${campaign.campaignId}/find-email/run`,
    );

    expect(again.status).toBe(400);
    expect(emailFinder.calls.flat()).toHaveLength(1);
  });
});

test("re-running the web search moves leads from later stages back to it, searches again even though they have a link, replaces it when a new one is found, and keeps it when nothing is", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, campaign, leads, webSearch, context } = await setup(
      database,
      [
        {
          fields: {
            name: "Jane Doe0",
            linkedinUrl: "https://www.linkedin.com/in/old-0",
          },
          stage: 4,
        },
        {
          fields: { name: "Jane Doe1", website: "https://old-1.example.com" },
          stage: 3,
        },
        {
          fields: {
            name: "Jane Doe2",
            linkedinUrl: "https://www.linkedin.com/in/old-2",
          },
          stage: 4,
        },
      ],
    );
    webSearch.answer = (input) =>
      input.query.startsWith("Jane Doe0")
        ? [
            {
              url: "https://www.linkedin.com/in/jane-doe0",
              title: "Jane Doe0 - Coach | LinkedIn",
              content: "",
            },
          ]
        : [];
    const chosen = [leads[0], leads[1]].map((lead) => lead?.leadId ?? 0);

    const response = await admin.post(path, { stage: 3, leadIds: chosen });

    expect(response.status).toBe(202);
    await runWorkers(context, campaign.campaignId);
    expect(result.parse(await response.json())).toEqual({
      queued: 2,
      skipped: 0,
    });
    expect(webSearch.calls.map((call) => call.query)).toEqual([
      "Jane Doe0 Club 0 LinkedIn",
      "Jane Doe1 Club 1 LinkedIn",
      "Jane Doe1 Club 1 official website",
    ]);
    expect(await leadOf(database.db, chosen[0] ?? 0)).toMatchObject({
      linkedinUrl: "https://www.linkedin.com/in/jane-doe0",
    });
    expect(await leadOf(database.db, chosen[1] ?? 0)).toMatchObject({
      linkedinUrl: null,
      website: "https://old-1.example.com",
    });
    for (const leadId of chosen) {
      expect(
        await rowOf(database.db, campaign.campaignId, leadId),
      ).toMatchObject({
        stage: 3,
        status: "done",
        failureReason: null,
        rerun: false,
      });
    }
    expect(
      await rowOf(database.db, campaign.campaignId, leads[2]?.leadId ?? 0),
    ).toMatchObject({ stage: 4, status: "done" });
    expect(await leadOf(database.db, leads[2]?.leadId ?? 0)).toMatchObject({
      linkedinUrl: "https://www.linkedin.com/in/old-2",
    });
  });
});

test("re-running the AI filter asks the AI again about the chosen leads only and replaces their verdict", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, campaign, leads, classifier, context } = await setup(
      database,
      [{ stage: 4 }, { stage: 4 }],
    );
    const chosen = leads[0]?.leadId ?? 0;

    const response = await admin.post(path, { stage: 2, leadIds: [chosen] });

    expect(response.status).toBe(202);
    await runWorkers(context, campaign.campaignId);
    expect(result.parse(await response.json())).toEqual({
      queued: 1,
      skipped: 0,
    });
    expect(classifier.calls).toHaveLength(1);
    expect(await database.db.$count(leadAssessmentsTable)).toBe(1);
    expect(await rowOf(database.db, campaign.campaignId, chosen)).toMatchObject(
      { stage: 2, rerun: false },
    );
    expect(
      await rowOf(database.db, campaign.campaignId, leads[1]?.leadId ?? 0),
    ).toMatchObject({ stage: 4, status: "done" });
  });
});

test("leads that are running another stage or have not reached the chosen one are left out and counted, and when none qualify nothing changes", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, campaign, leads, webSearch, context } = await setup(
      database,
      [
        { fields: { linkedinUrl: "https://www.linkedin.com/in/ok" }, stage: 4 },
        {
          fields: { linkedinUrl: "https://www.linkedin.com/in/busy" },
          stage: 4,
          status: "running",
        },
        {
          fields: { linkedinUrl: "https://www.linkedin.com/in/early" },
          stage: 1,
        },
      ],
    );
    context.queueHub.findEmail.unfinished.push({
      campaignId: campaign.campaignId,
    });
    const ids = leads.map((lead) => lead.leadId);

    const partial = await admin.post(path, { stage: 3, leadIds: ids });

    expect(partial.status).toBe(202);
    await new Services({ context }).enrich.runCampaign({
      campaignId: campaign.campaignId,
    });
    expect(result.parse(await partial.json())).toEqual({
      queued: 1,
      skipped: 2,
    });
    expect(webSearch.calls.map((call) => call.query)).toEqual([
      "Jane Doe0 Club 0 LinkedIn",
      "Jane Doe0 Club 0 official website",
    ]);
    expect(
      await rowOf(database.db, campaign.campaignId, ids[0] ?? 0),
    ).toMatchObject({ stage: 3, status: "done", rerun: false });
    expect(
      await rowOf(database.db, campaign.campaignId, ids[1] ?? 0),
    ).toMatchObject({ stage: 4, status: "running", rerun: false });
    expect(
      await rowOf(database.db, campaign.campaignId, ids[2] ?? 0),
    ).toMatchObject({ stage: 1, status: "done", rerun: false });

    const nothing = await admin.post(path, {
      stage: 3,
      leadIds: [ids[1] ?? 0, ids[2] ?? 0],
    });

    expect(nothing.status).toBe(400);
    expect(webSearch.calls).toHaveLength(2);
    expect(
      await rowOf(database.db, campaign.campaignId, ids[2] ?? 0),
    ).toMatchObject({ stage: 1, status: "done", rerun: false });
  });
});

test("a re-run that cannot start leaves the leads exactly as they were", async () => {
  await withTestDatabase(async (database) => {
    const draft = await setup(database, [{ stage: 4 }], "draft");

    const refused = await draft.admin.post(draft.path, {
      stage: 4,
      leadIds: [draft.leads[0]?.leadId ?? 0],
    });

    expect(refused.status).toBe(400);
    expect(
      await rowOf(
        database.db,
        draft.campaign.campaignId,
        draft.leads[0]?.leadId ?? 0,
      ),
    ).toMatchObject({ stage: 4, status: "done", rerun: false });
  });

  await withTestDatabase(async (database) => {
    const { admin, path, campaign, leads, context, classifier } = await setup(
      database,
      [{ stage: 4 }],
    );
    await context.repositories.campaignFilter.replaceQuestions({
      campaignId: campaign.campaignId,
      questions: [],
    });

    const refused = await admin.post(path, {
      stage: 2,
      leadIds: [leads[0]?.leadId ?? 0],
    });

    expect(refused.status).toBe(400);
    expect(classifier.calls).toEqual([]);
    expect(
      await rowOf(database.db, campaign.campaignId, leads[0]?.leadId ?? 0),
    ).toMatchObject({ stage: 4, status: "done", rerun: false });
  });
});

test("only an admin can re-run, an unknown campaign is 404, and a bad body is refused, all before anything moves", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, campaign, leads, context } = await setup(database, [
      { stage: 4 },
    ]);
    const member = await createAuthenticatedApp({
      context,
      email: "rerun-member@example.com",
    });
    const lead = leads[0]?.leadId ?? 0;
    const post = (body: object) =>
      member.app.request(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    const anonymous = await post({ stage: 4, leadIds: [lead] });
    const forbidden = await member.app.request(path, {
      method: "POST",
      headers: { cookie: member.cookie, "content-type": "application/json" },
      body: JSON.stringify({ stage: 4, leadIds: [lead] }),
    });
    const missing = await admin.post("/api/campaigns/999999/rerun", {
      stage: 4,
      leadIds: [lead],
    });
    const invalid = [
      { stage: 1, leadIds: [lead] },
      { stage: 5, leadIds: [lead] },
      { stage: 4, leadIds: [] },
      { stage: 4, leadIds: [0] },
      { stage: 4, leadIds: [1.5] },
      {
        stage: 4,
        leadIds: Array.from({ length: 1001 }, (_, index) => index + 1),
      },
      { stage: 4 },
    ];
    const statuses = [];
    for (const body of invalid)
      statuses.push((await admin.post(path, body)).status);

    // every rejection here comes from auth, a lookup or schema validation, all before any write
    expect([anonymous.status, forbidden.status, missing.status]).toEqual([
      401, 403, 404,
    ]);
    expect(statuses).toEqual(invalid.map(() => 400));
    expect(await rowOf(database.db, campaign.campaignId, lead)).toMatchObject({
      stage: 4,
      status: "done",
      rerun: false,
    });
  });
});

test("re-running emails is refused while a batch is waiting for its answer, and nothing moves", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, campaign, leads, emailFinder, context } = await setup(
      database,
      [
        {
          fields: {
            linkedinUrl: "https://www.linkedin.com/in/wait-a",
            emails: ["a@example.com"],
          },
        },
        { fields: { linkedinUrl: "https://www.linkedin.com/in/wait-b" } },
      ],
    );
    emailFinder.deferred = true;
    const services = new Services({ context });
    const [first, second] = leads.map((lead) => lead.leadId);
    await admin.post(path, { stage: 4, leadIds: [first ?? 0] });
    await services.findEmail.runCampaign({ campaignId: campaign.campaignId });
    expect(
      await rowOf(database.db, campaign.campaignId, first ?? 0),
    ).toMatchObject({ stage: 4, status: "running", rerun: true });

    const refused = await admin.post(path, {
      stage: 4,
      leadIds: [second ?? 0],
    });

    expect(refused.status).toBe(409);
    expect(emailFinder.starts).toHaveLength(1);
    expect(
      await rowOf(database.db, campaign.campaignId, second ?? 0),
    ).toMatchObject({ stage: 4, status: "done", rerun: false });
  });
});

test("when the answer comes from the sweep, a re-run lead keeps the emails it had, gains the new one, and stays done if the final answer has none", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, campaign, leads, emailFinder, context } = await setup(
      database,
      [
        {
          fields: {
            linkedinUrl: "https://www.linkedin.com/in/hook-a",
            emails: ["a-old@example.com"],
          },
        },
        {
          fields: {
            linkedinUrl: "https://www.linkedin.com/in/hook-b",
            emails: ["b-old@example.com"],
          },
        },
        { fields: { linkedinUrl: "https://www.linkedin.com/in/hook-c" } },
      ],
    );
    emailFinder.deferred = true;
    const services = new Services({ context });
    const ids = leads.map((lead) => lead.leadId);
    await admin.post(path, { stage: 4, leadIds: ids });
    await services.findEmail.runCampaign({ campaignId: campaign.campaignId });
    const start = emailFinder.starts[0];
    const answer = async (snapshot: object) => {
      emailFinder.snapshots.set("fake-1", {
        providerId: "fake-1",
        batchId: start?.batchId ?? null,
        state: "waiting",
        reason: null,
        results: [],
        ...snapshot,
      });
      await database.db
        .update(emailEnrichmentsTable)
        .set({ createdAt: new Date(Date.now() - 10 * 60_000) });
      await services.findEmail.sweep();
    };

    await answer({ results: [{ ref: 0, email: "A-New@Example.com" }] });
    await answer({
      state: "finished",
      results: [
        { ref: 1, email: null },
        { ref: 2, email: null },
      ],
    });

    expect(
      await Promise.all(ids.map((id) => leadOf(database.db, id))).then((rows) =>
        rows.map((row) => row?.emails),
      ),
    ).toEqual([
      ["a-old@example.com", "a-new@example.com"],
      ["b-old@example.com"],
      [],
    ]);
    const rows = [];
    for (const id of ids) {
      const row = await rowOf(database.db, campaign.campaignId, id);
      rows.push([row?.status, row?.failureReason, row?.rerun]);
    }
    expect(rows).toEqual([
      ["done", null, false],
      ["done", null, false],
      ["failed", "No email found", false],
    ]);
  });
});

test("ids from another campaign are ignored and counted as left out, and the other campaign is not touched", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, campaign, leads, context, emailFinder } = await setup(
      database,
      [{ fields: { linkedinUrl: "https://www.linkedin.com/in/mine" } }],
    );
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
      status: "done",
    });

    const response = await admin.post(path, {
      stage: 4,
      leadIds: [leads[0]?.leadId ?? 0, stranger.leadId],
    });
    await new Services({ context }).findEmail.runCampaign({
      campaignId: campaign.campaignId,
    });

    expect(result.parse(await response.json())).toEqual({
      queued: 1,
      skipped: 1,
    });
    expect(
      emailFinder.calls.flat().map((lookup) => lookup.linkedinUrl),
    ).toEqual(["https://www.linkedin.com/in/mine"]);
    expect(
      await rowOf(database.db, other.campaignId, stranger.leadId),
    ).toMatchObject({ stage: 4, status: "done", rerun: false });

    const onlyStranger = await admin.post(path, {
      stage: 4,
      leadIds: [stranger.leadId],
    });

    expect(onlyStranger.status).toBe(400);
    expect(
      await rowOf(database.db, other.campaignId, stranger.leadId),
    ).toMatchObject({ stage: 4, status: "done", rerun: false });
  });
});

test("the same id repeated counts once", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, leads, context, campaign } = await setup(database, [
      { fields: { linkedinUrl: "https://www.linkedin.com/in/dup-a" } },
      { fields: { linkedinUrl: "https://www.linkedin.com/in/dup-b" } },
    ]);
    const [first, second] = leads.map((lead) => lead.leadId);

    const response = await admin.post(path, {
      stage: 4,
      leadIds: [first, first, second, first],
    });
    await new Services({ context }).findEmail.runCampaign({
      campaignId: campaign.campaignId,
    });

    expect(response.status).toBe(202);
    expect(result.parse(await response.json())).toEqual({
      queued: 2,
      skipped: 0,
    });
  });
});

test("when the provider fails a re-run, the leads fail with its reason, keep the emails they had, and are no longer marked as re-run", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, campaign, leads, emailFinder, context } = await setup(
      database,
      [
        {
          fields: {
            linkedinUrl: "https://www.linkedin.com/in/fail-a",
            emails: ["keep@example.com"],
          },
        },
      ],
    );
    emailFinder.error = new Error("FullEnrich has no credits left.");
    const lead = leads[0];

    await admin.post(path, { stage: 4, leadIds: [lead?.leadId ?? 0] });
    await new Services({ context }).findEmail.runCampaign({
      campaignId: campaign.campaignId,
    });

    expect(
      await rowOf(database.db, campaign.campaignId, lead?.leadId ?? 0),
    ).toMatchObject({
      status: "failed",
      failureReason: "FullEnrich has no credits left.",
      rerun: false,
    });
    expect((await leadOf(database.db, lead?.leadId ?? 0))?.emails).toEqual([
      "keep@example.com",
    ]);
  });
});

test("two re-run leads with the same LinkedIn URL cost one lookup and both get the email", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, campaign, leads, emailFinder, context } = await setup(
      database,
      [
        {
          fields: {
            name: "Jane Doe",
            linkedinUrl: "https://www.linkedin.com/in/shared",
            emails: ["one@example.com"],
          },
        },
        {
          fields: {
            name: "JANE DOE",
            linkedinUrl: "https://www.linkedin.com/in/shared",
            emails: ["two@example.com"],
          },
        },
      ],
    );
    emailFinder.answer = () => "shared@example.com";

    await admin.post(path, {
      stage: 4,
      leadIds: leads.map((lead) => lead.leadId),
    });
    await new Services({ context }).findEmail.runCampaign({
      campaignId: campaign.campaignId,
    });

    expect(emailFinder.calls.flat()).toHaveLength(1);
    expect(
      await Promise.all(
        leads.map(
          async (lead) => (await leadOf(database.db, lead.leadId))?.emails,
        ),
      ),
    ).toEqual([
      ["one@example.com", "shared@example.com"],
      ["two@example.com", "shared@example.com"],
    ]);
  });
});

test("after a lead is re-run from the web search, running the email search normally does not force it: a lead that has emails is not looked up", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, campaign, leads, emailFinder, context } = await setup(
      database,
      [
        {
          fields: {
            linkedinUrl: "https://www.linkedin.com/in/chain",
            emails: ["chain@example.com"],
          },
        },
      ],
    );
    const services = new Services({ context });
    const lead = leads[0];

    await admin.post(path, { stage: 3, leadIds: [lead?.leadId ?? 0] });
    await services.enrich.runCampaign({ campaignId: campaign.campaignId });
    expect(
      await rowOf(database.db, campaign.campaignId, lead?.leadId ?? 0),
    ).toMatchObject({ stage: 3, status: "done", rerun: false });

    const next = await admin.post(
      `/api/campaigns/${campaign.campaignId}/find-email/run`,
    );
    await services.findEmail.runCampaign({ campaignId: campaign.campaignId });

    expect(next.status).toBe(202);
    expect(emailFinder.calls).toEqual([]);
    expect(
      await rowOf(database.db, campaign.campaignId, lead?.leadId ?? 0),
    ).toMatchObject({ stage: 4, status: "done", rerun: false });
    expect((await leadOf(database.db, lead?.leadId ?? 0))?.emails).toEqual([
      "chain@example.com",
    ]);
  });
});

test("re-running the AI filter replaces the stored verdict and moves the lead's status to match it", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, campaign, leads, classifier, context } = await setup(
      database,
      [{ stage: 4 }],
    );
    const services = new Services({ context });
    const lead = leads[0]?.leadId ?? 0;

    await admin.post(path, { stage: 2, leadIds: [lead] });
    await services.filter.runCampaign({ campaignId: campaign.campaignId });
    const first = (await database.db.select().from(leadAssessmentsTable))[0];
    expect(first?.verdict).toBe("qualified");
    expect(await rowOf(database.db, campaign.campaignId, lead)).toMatchObject({
      stage: 2,
      status: "done",
    });

    classifier.answer = (input) => ({
      answers: input.questions.map((question) => ({
        questionId: question.questionId,
        answer: "no",
        evidence: null,
      })),
      summary: "Not a fit.",
      model: "fake",
    });
    await admin.post(path, { stage: 2, leadIds: [lead] });
    await services.filter.runCampaign({ campaignId: campaign.campaignId });

    const assessments = await database.db.select().from(leadAssessmentsTable);
    expect(assessments).toHaveLength(1);
    expect(assessments[0]).toMatchObject({
      verdict: "disqualified",
      summary: "Not a fit.",
    });
    expect(await rowOf(database.db, campaign.campaignId, lead)).toMatchObject({
      stage: 2,
      status: "failed",
      failureReason: "Disqualified",
    });
  });
});

const scopeGroups = [
  "doneA",
  "doneB",
  "failedNoEmail",
  "failedProvider",
  "waiting",
  "early",
] as const;

const scopeSeed: Seeded[] = [
  { status: "done" },
  { status: "done" },
  { status: "failed" },
  { status: "failed" },
  { status: "pending" },
  { stage: 3, status: "done" },
].map((spec, index) => ({
  ...spec,
  fields: {
    linkedinUrl: linkedin(scopeGroups[index] ?? ""),
    emails:
      scopeGroups[index] === "waiting"
        ? []
        : [`old-${scopeGroups[index]}@example.com`],
  },
}));

for (const [scope, expected] of [
  ["failed", ["failedNoEmail", "failedProvider"]],
  ["done", ["doneA", "doneB"]],
  ["all", ["doneA", "doneB", "failedNoEmail", "failedProvider", "waiting"]],
] as const) {
  test(`re-running the email search for the ${scope} scope looks up and writes emails only for ${expected.join(", ")}, not for the other groups or another campaign`, async () => {
    await withTestDatabase(async (database) => {
      const { admin, path, campaign, leads, emailFinder, context } =
        await setup(database, scopeSeed);
      const idOf = (name: (typeof scopeGroups)[number]) =>
        leads[scopeGroups.indexOf(name)]?.leadId ?? 0;
      await database.db
        .update(campaignLeadsTable)
        .set({ failureReason: "No email found" })
        .where(eq(campaignLeadsTable.leadId, idOf("failedNoEmail")));
      await database.db
        .update(campaignLeadsTable)
        .set({ failureReason: "FullEnrich was unreachable" })
        .where(eq(campaignLeadsTable.leadId, idOf("failedProvider")));
      const stranger = await seedLead(context, {
        skoolUsername: "rerun-stranger",
        name: "Jane Stranger",
        linkedinUrl: linkedin("stranger"),
        emails: ["old-stranger@example.com"],
      });
      const otherCampaign = await context.repositories.campaign.create({
        name: "Another campaign",
        keywords: ["coaching"],
        types: ["public"],
        pricingModels: ["paid"],
        status: "active",
      });
      await context.repositories.campaignLead.attach({
        campaignId: otherCampaign.campaignId,
        leads: [{ leadId: stranger.leadId, keyword: "coaching" }],
        stage: 4,
        status: "done",
      });
      emailFinder.answer = (lookup) =>
        `new-${lookup.linkedinUrl?.split("/").at(-1)}@example.com`;

      const response = await admin.post(path, { stage: 4, scope });

      expect(response.status).toBe(202);
      const job = context.queueHub.findEmail.added.at(-1);
      expect(job).toEqual({ campaignId: campaign.campaignId, onlyRerun: true });
      await new Services({ context }).findEmail.runCampaign(
        job ?? { campaignId: campaign.campaignId },
      );
      const searched = emailFinder.calls
        .flat()
        .map((lookup) => lookup.linkedinUrl?.split("/").at(-1))
        .toSorted();
      expect(searched).toEqual([...expected].toSorted());
      for (const name of scopeGroups) {
        const emails = (await leadOf(database.db, idOf(name)))?.emails;
        const before = name === "waiting" ? [] : [`old-${name}@example.com`];
        const found = `new-${name.toLowerCase()}@example.com`;
        expect(emails).toEqual(
          (expected as readonly string[]).includes(name)
            ? [...before, found]
            : before,
        );
      }
      expect((await leadOf(database.db, stranger.leadId))?.emails).toEqual([
        "old-stranger@example.com",
      ]);
      expect(
        (
          await database.db
            .select()
            .from(campaignLeadsTable)
            .where(eq(campaignLeadsTable.campaignId, otherCampaign.campaignId))
        ).map((row) => [row.stage, row.status, row.rerun]),
      ).toEqual([[4, "done", false]]);
      expect(
        await rowOf(database.db, campaign.campaignId, idOf("early")),
      ).toMatchObject({ stage: 3, status: "done" });
    });
  });
}

test("a scope with no matching leads is rejected and changes nothing", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, campaign, leads } = await setup(database, [
      { fields: { linkedinUrl: "https://www.linkedin.com/in/done" } },
    ]);

    const response = await admin.post(path, { stage: 4, scope: "failed" });

    expect(response.status).toBe(400);
    expect(
      await rowOf(database.db, campaign.campaignId, leads[0]?.leadId ?? 0),
    ).toMatchObject({ stage: 4, status: "done", rerun: false });
  });
});

test("a re-run with neither lead ids nor a scope is rejected before anything is written", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, campaign, leads } = await setup(database, [
      { fields: { linkedinUrl: "https://www.linkedin.com/in/done" } },
    ]);

    const response = await admin.post(path, { stage: 4 });

    expect(response.status).toBe(400);
    expect(
      await rowOf(database.db, campaign.campaignId, leads[0]?.leadId ?? 0),
    ).toMatchObject({ stage: 4, status: "done", rerun: false });
  });
});

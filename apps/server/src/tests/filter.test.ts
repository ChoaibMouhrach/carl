import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import z from "zod";
import type { FilterQuestionInput } from "@repo/constants/filter";
import { sampleFilterQuestions } from "@server/testing/filter-questions";
import { initENV } from "@server/config/env";
import {
  campaignFilterQuestionsTable,
  campaignLeadsTable,
  campaignsTable,
  leadAssessmentsTable,
} from "@server/infrastructure/database/schemas";
import { computeVerdict, signalScore } from "@server/lib/assessment";
import {
  buildClassifierPrompt,
  classifierInstructions,
} from "@server/lib/classifier-prompt";
import { Services } from "@server/services";
import { createAdminClient, seedCommunity, seedLead } from "./helpers/api";
import {
  createContext,
  FakeLeadClassifier,
  TestMailer,
} from "./helpers/context";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";

type Database = Parameters<Parameters<typeof withTestDatabase>[0]>[0];

const setup = async ({ db, pool }: Database, leadCount = 3) => {
  const classifier = new FakeLeadClassifier();
  const context = createContext(
    db,
    pool,
    initENV(),
    new TestMailer(),
    undefined,
    undefined,
    classifier,
  );
  const admin = await createAdminClient(context, "filter-admin@example.com");
  const campaign = await context.repositories.campaign.create({
    name: "Filtered",
    keywords: ["coaching"],
    types: ["public"],
    pricingModels: ["paid"],
    status: "active",
  });
  await context.repositories.campaignFilter.replaceQuestions({
    campaignId: campaign.campaignId,
    questions: sampleFilterQuestions,
  });
  const leads = [];
  for (let index = 0; index < leadCount; index += 1) {
    const lead = await seedLead(context, {
      skoolUsername: `lead-${index}`,
      name: `Lead ${index}`,
      bio: `Coach number ${index}`,
    });
    await seedCommunity(context, lead.leadId, { displayName: `Club ${index}` });
    leads.push(lead);
  }
  await context.repositories.campaignLead.attach({
    campaignId: campaign.campaignId,
    leads: leads.map((lead) => ({ leadId: lead.leadId, keyword: "coaching" })),
    stage: 1,
    status: "done",
  });

  return {
    classifier,
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

const question = (
  overrides: Partial<FilterQuestionInput> = {},
): FilterQuestionInput => ({
  label: "Is it real?",
  guidance: "",
  role: "requirement",
  onUnknown: "review",
  enabled: true,
  ...overrides,
});

// ---- the verdict rules ----

const verdictCases: [string, Parameters<typeof computeVerdict>[0], string][] = [
  [
    "every requirement yes and evidence yes",
    [
      { role: "requirement", onUnknown: "review", answer: "yes" },
      { role: "evidence", onUnknown: "review", answer: "yes" },
    ],
    "qualified",
  ],
  [
    "a competitor yes beats everything",
    [
      { role: "requirement", onUnknown: "review", answer: "no" },
      { role: "competitor", onUnknown: "review", answer: "yes" },
    ],
    "competitor",
  ],
  [
    "a disqualifier yes",
    [
      { role: "requirement", onUnknown: "review", answer: "yes" },
      { role: "disqualifier", onUnknown: "review", answer: "yes" },
    ],
    "disqualified",
  ],
  [
    "a requirement that is no",
    [{ role: "requirement", onUnknown: "review", answer: "no" }],
    "disqualified",
  ],
  [
    "a requirement unknown with review",
    [{ role: "requirement", onUnknown: "review", answer: "unknown" }],
    "needs_review",
  ],
  [
    "a requirement unknown with disqualify",
    [{ role: "requirement", onUnknown: "disqualify", answer: "unknown" }],
    "disqualified",
  ],
  [
    "evidence that is not a yes",
    [
      { role: "requirement", onUnknown: "review", answer: "yes" },
      { role: "evidence", onUnknown: "review", answer: "no" },
    ],
    "needs_review",
  ],
  [
    "a competitor answer that is no or unknown does not block",
    [
      { role: "competitor", onUnknown: "disqualify", answer: "no" },
      { role: "requirement", onUnknown: "review", answer: "yes" },
    ],
    "qualified",
  ],
  [
    "a disqualifier that is no",
    [{ role: "disqualifier", onUnknown: "review", answer: "no" }],
    "qualified",
  ],
  ["no questions at all", [], "qualified"],
  [
    "signals answered no or unknown never lower a qualified lead",
    [
      { role: "requirement", onUnknown: "review", answer: "yes" },
      { role: "signal", onUnknown: "review", answer: "no" },
      { role: "signal", onUnknown: "review", answer: "unknown" },
    ],
    "qualified",
  ],
  [
    "signals answered yes do not rescue a failed requirement",
    [
      { role: "requirement", onUnknown: "review", answer: "no" },
      { role: "signal", onUnknown: "review", answer: "yes" },
    ],
    "disqualified",
  ],
];

for (const [label, answered, expected] of verdictCases) {
  test(`the verdict for ${label} is ${expected}`, () => {
    expect(computeVerdict(answered)).toBe(
      expected as ReturnType<typeof computeVerdict>,
    );
  });
}

// ---- the questions ----

test("saving the questions stores them in order with the campaign's context and replaces the old list", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, context, campaign } = await setup(database);
    context.eventBus.published.length = 0;

    const saved = await admin.put(`${path}/filter`, {
      context: "  Agencies selling to coaches  ",
      questions: [
        question({ label: "First" }),
        question({ label: "Second", role: "competitor", enabled: false }),
      ],
    });

    expect(saved.status).toBe(200);
    const rows = await database.db.select().from(campaignFilterQuestionsTable);
    expect(
      rows.map((row) => [row.position, row.label, row.role, row.enabled]),
    ).toEqual([
      [0, "First", "requirement", true],
      [1, "Second", "competitor", false],
    ]);
    const [stored] = await database.db
      .select()
      .from(campaignsTable)
      .where(eq(campaignsTable.campaignId, campaign.campaignId));
    expect(stored?.filterContext).toBe("Agencies selling to coaches");
    expect(context.eventBus.published).toEqual(["campaigns.changed"]);
  });
});

test("another campaign's questions are untouched by a save", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, context } = await setup(database);
    const other = await context.repositories.campaign.create({
      name: "Other",
      keywords: ["x"],
      types: ["public"],
      pricingModels: ["paid"],
    });
    await context.repositories.campaignFilter.replaceQuestions({
      campaignId: other.campaignId,
      questions: [question({ label: "Theirs" })],
    });

    await admin.put(`${path}/filter`, {
      context: null,
      questions: [question({ label: "Mine" })],
    });

    const rows = await database.db.select().from(campaignFilterQuestionsTable);
    expect(
      rows
        .filter((row) => row.campaignId === other.campaignId)
        .map((row) => row.label),
    ).toEqual(["Theirs"]);
  });
});

const invalidSaves = [
  ["a blank label", { context: null, questions: [question({ label: "   " })] }],
  [
    "a label of 256 characters",
    { context: null, questions: [question({ label: "q".repeat(256) })] },
  ],
  [
    "guidance of 2001 characters",
    { context: null, questions: [question({ guidance: "g".repeat(2001) })] },
  ],
  ["context of 4001 characters", { context: "c".repeat(4001), questions: [] }],
  [
    "thirteen questions",
    {
      context: null,
      questions: Array.from({ length: 13 }, (_, i) =>
        question({ label: `q${i}` }),
      ),
    },
  ],
  [
    "an unknown role",
    { context: null, questions: [{ ...question(), role: "boss" }] },
  ],
  [
    "an unknown behaviour",
    { context: null, questions: [{ ...question(), onUnknown: "shrug" }] },
  ],
  ["no questions array", { context: null }],
] as const;

for (const [label, body] of invalidSaves) {
  test(`saving ${label} is refused and the saved questions are unchanged`, async () => {
    await withTestDatabase(async (database) => {
      const { admin, path } = await setup(database);
      const before = await database.db
        .select()
        .from(campaignFilterQuestionsTable);

      const response = await admin.put(`${path}/filter`, body);

      // Schema validation runs before the service, so no write was possible
      expect(response.status).toBe(400);
      expect(
        await database.db.select().from(campaignFilterQuestionsTable),
      ).toEqual(before);
    });
  });
}

test("twelve questions and an empty list are both accepted", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path } = await setup(database);

    const twelve = await admin.put(`${path}/filter`, {
      context: null,
      questions: Array.from({ length: 12 }, (_, i) =>
        question({ label: `q${i}` }),
      ),
    });
    const none = await admin.put(`${path}/filter`, {
      context: null,
      questions: [],
    });

    expect([twelve.status, none.status]).toEqual([200, 200]);
    expect(await database.db.$count(campaignFilterQuestionsTable)).toBe(0);
  });
});

test("the settings of an unknown campaign are a 404 and only admins can read or change them", async () => {
  await withTestDatabase(async (database) => {
    const { admin, context, path } = await setup(database);
    const member = await createAuthenticatedApp({
      context,
      email: "filter-member@example.com",
    });

    const missing = await admin.get("/api/campaigns/999999/filter");
    const saveMissing = await admin.put("/api/campaigns/999999/filter", {
      context: null,
      questions: [],
    });
    const read = await member.app.request(`${path}/filter`, {
      headers: { cookie: member.cookie },
    });
    const run = await member.app.request(`${path}/filter/run`, {
      method: "POST",
      headers: { cookie: member.cookie },
    });

    expect([
      missing.status,
      saveMissing.status,
      read.status,
      run.status,
    ]).toEqual([404, 404, 403, 403]);
    expect(await database.db.$count(campaignFilterQuestionsTable)).toBe(
      sampleFilterQuestions.length,
    );
  });
});

test("only the questions that are switched on are asked", async () => {
  await withTestDatabase(async (database) => {
    const { context, campaign, services, classifier } = await setup(database);
    await context.repositories.campaignFilter.replaceQuestions({
      campaignId: campaign.campaignId,
      questions: [
        question({ label: "On" }),
        question({ label: "Off", enabled: false }),
      ],
    });

    await runAll(services, campaign.campaignId);

    expect(classifier.calls[0]?.questions.map((q) => q.label)).toEqual(["On"]);
  });
});

// ---- running the filter ----

test("starting moves the leads that finished stage 1 to stage 2, queues one job and refuses a second start while it runs", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, campaign, leads, context } = await setup(database);
    context.eventBus.published.length = 0;

    const started = await admin.post(`${path}/filter/run`);

    expect(started.status).toBe(202);
    expect(
      z.object({ queued: z.number() }).parse(await started.json()).queued,
    ).toBe(3);
    for (const lead of leads) {
      expect(
        await rowOf(database.db, campaign.campaignId, lead.leadId),
      ).toMatchObject({ stage: 2, status: "pending" });
    }
    expect(context.eventBus.published).toContain("campaigns.changed");

    await database.db
      .update(campaignLeadsTable)
      .set({ status: "running" })
      .where(eq(campaignLeadsTable.leadId, leads[0]?.leadId ?? 0));
    const again = await admin.post(`${path}/filter/run`);
    expect(again.status).toBe(409);
  });
});

test("a campaign that is not active, has no questions, has nobody waiting or has no AI set up cannot start", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, context, campaign, classifier } =
      await setup(database);
    const statusOf = async () =>
      (await admin.post(`${path}/filter/run`)).status;

    await context.repositories.campaign.update(
      { campaignId: campaign.campaignId },
      { status: "paused" },
    );
    const paused = await statusOf();
    await context.repositories.campaign.update(
      { campaignId: campaign.campaignId },
      { status: "active" },
    );
    classifier.configured = false;
    const unconfigured = await statusOf();
    classifier.configured = true;
    await context.repositories.campaignFilter.replaceQuestions({
      campaignId: campaign.campaignId,
      questions: [],
    });
    const noQuestions = await statusOf();
    await context.repositories.campaignFilter.replaceQuestions({
      campaignId: campaign.campaignId,
      questions: sampleFilterQuestions,
    });
    await database.db.update(campaignLeadsTable).set({ status: "failed" });
    const nobody = await statusOf();

    // Every refusal came before any lead was moved, which the stages show
    expect([paused, unconfigured, noQuestions, nobody]).toEqual([
      400, 400, 400, 400,
    ]);
    const rows = await database.db.select().from(campaignLeadsTable);
    expect(rows.every((row) => row.stage === 1)).toBe(true);
    expect(await database.db.$count(leadAssessmentsTable)).toBe(0);
  });
});

test("the worker keeps an assessment for every lead and passes only the qualified ones", async () => {
  await withTestDatabase(async (database) => {
    const { services, campaign, leads, classifier, context } =
      await setup(database);
    const verdicts = ["qualified", "needs_review", "competitor"];
    classifier.answer = (input) => {
      const index = Number(input.leadUsername.split("-")[1]);
      const verdict = verdicts[index];

      return {
        answers: input.questions.map((q) => ({
          questionId: q.questionId,
          answer:
            q.role === "competitor"
              ? verdict === "competitor"
                ? "yes"
                : "no"
              : verdict === "needs_review" && q.role === "requirement"
                ? "unknown"
                : "yes",
          evidence: input.facts.split("\n")[0] ?? null,
        })),
        summary: `Verdict ${verdict}`,
        model: "fake",
      };
    };
    await services.filter
      .start({ campaignId: campaign.campaignId })
      .catch(() => undefined);
    context.eventBus.published.length = 0;
    await services.filter.runCampaign({ campaignId: campaign.campaignId });

    const rows = await database.db.select().from(leadAssessmentsTable);
    expect(rows).toHaveLength(3);
    leads.forEach((lead, index) => {
      expect(rows.find((row) => row.leadId === lead.leadId)).toMatchObject({
        verdict: verdicts[index],
        summary: `Verdict ${verdicts[index]}`,
      });
    });
    expect(
      await rowOf(database.db, campaign.campaignId, leads[0]?.leadId ?? 0),
    ).toMatchObject({ stage: 2, status: "done", failureReason: null });
    expect(
      await rowOf(database.db, campaign.campaignId, leads[1]?.leadId ?? 0),
    ).toMatchObject({
      stage: 2,
      status: "failed",
      failureReason: "Needs review",
    });
    expect(
      await rowOf(database.db, campaign.campaignId, leads[2]?.leadId ?? 0),
    ).toMatchObject({
      stage: 2,
      status: "failed",
      failureReason: "Competitor",
    });
    expect(context.eventBus.published).toContain("campaigns.changed");
  });
});

test("an assessment keeps each question as it was asked, so changing the questions later does not change it", async () => {
  await withTestDatabase(async (database) => {
    const { services, admin, path, campaign, leads } = await setup(database, 1);
    await services.filter.start({ campaignId: campaign.campaignId });
    await services.filter.runCampaign({ campaignId: campaign.campaignId });

    await admin.put(`${path}/filter`, {
      context: null,
      questions: [question({ label: "Brand new question" })],
    });

    const [row] = await database.db.select().from(leadAssessmentsTable);
    expect(row?.answers.map((answer) => answer.label)).toEqual(
      sampleFilterQuestions.map((q) => q.label),
    );
    const response = await admin.get(
      `${path}/leads/${leads[0]?.leadId}/assessment`,
    );
    expect(response.status).toBe(200);
  });
});

test("a lead the AI fails on is marked failed with the reason, gets no assessment and is tried again by the next run", async () => {
  await withTestDatabase(async (database) => {
    const { services, campaign, leads, classifier } = await setup(database, 2);
    classifier.error = new Error("The AI is down");
    await services.filter.start({ campaignId: campaign.campaignId });
    await services.filter.runCampaign({ campaignId: campaign.campaignId });

    expect(await database.db.$count(leadAssessmentsTable)).toBe(0);
    for (const lead of leads) {
      expect(
        await rowOf(database.db, campaign.campaignId, lead.leadId),
      ).toMatchObject({
        stage: 2,
        status: "failed",
        failureReason: "The AI is down",
      });
    }

    classifier.error = null;
    await services.filter.start({ campaignId: campaign.campaignId });
    await services.filter.runCampaign({ campaignId: campaign.campaignId });

    expect(await database.db.$count(leadAssessmentsTable)).toBe(2);
    expect(
      await rowOf(database.db, campaign.campaignId, leads[0]?.leadId ?? 0),
    ).toMatchObject({ status: "done" });
  });
});

test("a lead that already has an answer is not asked about again by a later run", async () => {
  await withTestDatabase(async (database) => {
    const { services, campaign, classifier } = await setup(database, 2);
    await services.filter.start({ campaignId: campaign.campaignId });
    await services.filter.runCampaign({ campaignId: campaign.campaignId });
    const asked = classifier.calls.length;

    const again = await services.filter
      .start({ campaignId: campaign.campaignId })
      .catch((error: Error) => error.message);

    expect(again).toBe("No leads are waiting for the AI filter.");
    expect(classifier.calls).toHaveLength(asked);
  });
});

test("leads are classified a few at a time and never more than four at once", async () => {
  await withTestDatabase(async (database) => {
    const { services, campaign, classifier } = await setup(database, 10);
    classifier.delayMs = 30;
    await services.filter.start({ campaignId: campaign.campaignId });

    await services.filter.runCampaign({ campaignId: campaign.campaignId });

    expect(classifier.calls).toHaveLength(10);
    expect(classifier.peakInFlight).toBeGreaterThan(1);
    expect(classifier.peakInFlight).toBeLessThanOrEqual(4);
  });
});

test("leads at other stages are left alone by a run", async () => {
  await withTestDatabase(async (database) => {
    const { services, campaign, context, classifier } = await setup(
      database,
      1,
    );
    const bystander = await seedLead(context, {
      skoolUsername: "bystander",
      name: "Bystander",
    });
    await context.repositories.campaignLead.attach({
      campaignId: campaign.campaignId,
      leads: [{ leadId: bystander.leadId, keyword: "x" }],
      stage: 3,
      status: "pending",
    });
    await services.filter.start({ campaignId: campaign.campaignId });

    await services.filter.runCampaign({ campaignId: campaign.campaignId });

    expect(classifier.calls.map((call) => call.leadUsername)).toEqual([
      "lead-0",
    ]);
    expect(
      await rowOf(database.db, campaign.campaignId, bystander.leadId),
    ).toMatchObject({ stage: 3, status: "pending" });
  });
});

test("the campaign's lead list carries each lead's verdict and a lead with no assessment has none", async () => {
  await withTestDatabase(async (database) => {
    const { services, admin, path, campaign, context } = await setup(
      database,
      1,
    );
    const unassessed = await seedLead(context, {
      skoolUsername: "not-yet",
      name: "Not yet",
    });
    await context.repositories.campaignLead.attach({
      campaignId: campaign.campaignId,
      leads: [{ leadId: unassessed.leadId, keyword: "x" }],
      stage: 1,
      status: "pending",
    });
    await services.filter.start({ campaignId: campaign.campaignId });
    await services.filter.runCampaign({ campaignId: campaign.campaignId });

    const body = z
      .object({
        leads: z.array(
          z.object({
            skoolUsername: z.string(),
            verdict: z.string().nullable(),
          }),
        ),
      })
      .parse(await (await admin.get(`${path}/leads`)).json());

    expect(
      Object.fromEntries(
        body.leads.map((lead) => [lead.skoolUsername, lead.verdict]),
      ),
    ).toEqual({ "lead-0": "qualified", "not-yet": null });
  });
});

test("an assessment that does not exist is a 404", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, leads } = await setup(database, 1);

    const response = await admin.get(
      `${path}/leads/${leads[0]?.leadId}/assessment`,
    );

    expect(response.status).toBe(404);
  });
});

test("deleting a lead or a campaign deletes their assessments and questions", async () => {
  await withTestDatabase(async (database) => {
    const { services, admin, path, campaign, leads } = await setup(database, 2);
    await services.filter.start({ campaignId: campaign.campaignId });
    await services.filter.runCampaign({ campaignId: campaign.campaignId });
    expect(await database.db.$count(leadAssessmentsTable)).toBe(2);

    await admin.delete(`/api/leads/${leads[0]?.leadId}`);
    expect(await database.db.$count(leadAssessmentsTable)).toBe(1);

    await admin.delete(path);
    expect(await database.db.$count(leadAssessmentsTable)).toBe(0);
    expect(await database.db.$count(campaignFilterQuestionsTable)).toBe(0);
  });
});

// ---- reading the prompt ----

const promptBody = z.object({
  provider: z.string(),
  model: z.string(),
  system: z.string(),
  prompt: z.string(),
  schema: z.record(z.string(), z.unknown()),
});

test("the prompt shows the context, only the questions that are on and the instructions, for a draft that is not saved", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path } = await setup(database);
    const before = await database.db
      .select()
      .from(campaignFilterQuestionsTable);

    const response = await admin.post(`${path}/filter/prompt`, {
      context: "We sell automation to coaches.",
      questions: [
        question({ label: "Is it a business?", guidance: "Charges money." }),
        question({ label: "Switched off", enabled: false }),
        question({ label: "Is it a rival?", role: "competitor" }),
      ],
    });
    const body = promptBody.parse(await response.json());

    expect(response.status).toBe(200);
    expect(body.system).toContain("Use ONLY the text provided under LEAD");
    expect(body.prompt).toContain(
      "WHAT WE ARE TRYING TO DO:\nWe sell automation to coaches.",
    );
    expect(body.prompt).toContain(
      "- questionId 1: Is it a business? (Charges money.)",
    );
    expect(body.prompt).toContain("- questionId 2: Is it a rival?");
    expect(body.prompt).not.toContain("Switched off");
    expect(body.prompt).toContain(
      "LEAD:\n(The owner's profile and communities are written out here",
    );
    expect(body.provider).toBe("fake");
    expect(body.model).toBe("fake");
    expect(body.schema).toMatchObject({
      type: "object",
      required: expect.arrayContaining(["answers", "summary"]),
    });
    // Showing a prompt writes nothing, so the saved questions are exactly as before
    expect(
      await database.db.select().from(campaignFilterQuestionsTable),
    ).toEqual(before);
  });
});

test("the prompt is the same text the AI is sent up to the lead, apart from the question numbers", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, services, campaign, classifier } =
      await setup(database);
    const saved = await admin.get(`${path}/filter`);
    const settings = z
      .object({
        context: z.string().nullable(),
        questions: z.array(
          z.object({
            label: z.string(),
            guidance: z.string(),
            role: z.string(),
            onUnknown: z.string(),
            enabled: z.boolean(),
          }),
        ),
      })
      .parse(await saved.json());
    await runAll(services, campaign.campaignId);

    const shown = promptBody.parse(
      await (await admin.post(`${path}/filter/prompt`, settings)).json(),
    );

    const sent = buildClassifierPrompt(
      classifier.calls[0] ?? { context: null, questions: [], facts: "" },
    );
    const beforeLead = (text: string) =>
      text.replace(/questionId \d+/g, "questionId N").split("\n\nLEAD:")[0];
    expect(beforeLead(shown.prompt)).toBe(beforeLead(sent));
    expect(shown.system).toBe(classifierInstructions);
  });
});

test("a prompt cannot be shown with every question off, for an unknown campaign, or by a member", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, context } = await setup(database);
    const member = await createAuthenticatedApp({
      context,
      email: "prompt-member@example.com",
    });

    const none = await admin.post(`${path}/filter/prompt`, {
      context: null,
      questions: [question({ enabled: false })],
    });
    const noCampaign = await admin.post("/api/campaigns/999999/filter/prompt", {
      context: null,
      questions: [question()],
    });
    const refused = await member.app.request(`${path}/filter/prompt`, {
      method: "POST",
      headers: { cookie: member.cookie, "content-type": "application/json" },
      body: JSON.stringify({ context: null, questions: [question()] }),
    });

    expect([none.status, noCampaign.status, refused.status]).toEqual([
      400, 404, 403,
    ]);
  });
});

test("the signal score counts the signal questions answered yes and ignores the other roles", () => {
  expect(
    signalScore([
      { role: "signal", answer: "yes" },
      { role: "signal", answer: "no" },
      { role: "signal", answer: "yes" },
      { role: "requirement", answer: "yes" },
    ]),
  ).toEqual({ yes: 2, total: 3 });
  expect(signalScore([{ role: "requirement", answer: "no" }])).toEqual({
    yes: 0,
    total: 0,
  });
});

// ---- re-applying the rules ----

const runAll = async (services: Services, campaignId: number) => {
  await services.filter.start({ campaignId });
  await services.filter.runCampaign({ campaignId });
};

test("re-applying the rules gives each lead a new verdict from its stored answers, moves its stage status and never asks the AI", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, services, campaign, leads, classifier, context } =
      await setup(database, 2);
    await runAll(services, campaign.campaignId);
    const asked = classifier.calls.length;
    expect(await database.db.$count(leadAssessmentsTable)).toBe(2);

    await admin.put(`${path}/filter`, {
      context: null,
      questions: sampleFilterQuestions.map((q) =>
        q.label === "Is this a commercial business?"
          ? { ...q, role: "disqualifier" }
          : q,
      ),
    });
    context.eventBus.published.length = 0;
    const response = await admin.post(`${path}/filter/reapply`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ total: 2, changed: 2, skipped: 0 });
    const rows = await database.db.select().from(leadAssessmentsTable);
    expect(rows.map((row) => row.verdict)).toEqual([
      "disqualified",
      "disqualified",
    ]);
    expect(
      rows[0]?.answers.find((a) => a.label === "Is this a commercial business?")
        ?.role,
    ).toBe("disqualifier");
    for (const lead of leads) {
      expect(
        await rowOf(database.db, campaign.campaignId, lead.leadId),
      ).toMatchObject({
        stage: 2,
        status: "failed",
        failureReason: "Disqualified",
      });
    }
    expect(classifier.calls).toHaveLength(asked);
    expect(context.eventBus.published).toContain("campaigns.changed");

    await admin.put(`${path}/filter`, {
      context: null,
      questions: sampleFilterQuestions,
    });
    const back = await admin.post(`${path}/filter/reapply`);

    expect(await back.json()).toEqual({ total: 2, changed: 2, skipped: 0 });
    expect(
      (await database.db.select().from(leadAssessmentsTable)).map(
        (r) => r.verdict,
      ),
    ).toEqual(["qualified", "qualified"]);
    expect(
      await rowOf(database.db, campaign.campaignId, leads[0]?.leadId ?? 0),
    ).toMatchObject({ status: "done", failureReason: null });
  });
});

test("turning a requirement into a signal lets a lead that failed it through", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, services, campaign, leads, classifier } = await setup(
      database,
      1,
    );
    classifier.answer = (input) => ({
      answers: input.questions.map((q) => ({
        questionId: q.questionId,
        answer:
          q.label === "Is the owner a potential buyer?" ||
          q.role === "competitor"
            ? "no"
            : "yes",
        evidence:
          q.label === "Is the owner a potential buyer?"
            ? null
            : (input.facts.split("\n")[0] ?? null),
      })),
      summary: "Not a buyer",
      model: "fake",
    });
    await runAll(services, campaign.campaignId);
    const [before] = await database.db.select().from(leadAssessmentsTable);
    expect(before?.verdict).toBe("disqualified");

    await admin.put(`${path}/filter`, {
      context: null,
      questions: sampleFilterQuestions.map((q) =>
        q.label === "Is the owner a potential buyer?"
          ? { ...q, role: "signal" }
          : q,
      ),
    });
    await admin.post(`${path}/filter/reapply`);

    const [after] = await database.db.select().from(leadAssessmentsTable);
    expect(after?.verdict).toBe("qualified");
    expect(
      await rowOf(database.db, campaign.campaignId, leads[0]?.leadId ?? 0),
    ).toMatchObject({ status: "done", failureReason: null });
  });
});

test("an assessment missing an answer to a question that was added since is skipped and left as it was", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, services, campaign, leads } = await setup(database, 1);
    await runAll(services, campaign.campaignId);

    await admin.put(`${path}/filter`, {
      context: null,
      questions: [
        ...sampleFilterQuestions,
        question({ label: "A question the AI never saw" }),
      ],
    });
    const response = await admin.post(`${path}/filter/reapply`);

    expect(await response.json()).toEqual({ total: 1, changed: 0, skipped: 1 });
    const [row] = await database.db.select().from(leadAssessmentsTable);
    expect(row?.verdict).toBe("qualified");
    expect(row?.answers).toHaveLength(sampleFilterQuestions.length);
    expect(
      await rowOf(database.db, campaign.campaignId, leads[0]?.leadId ?? 0),
    ).toMatchObject({ status: "done" });
  });
});

test("re-applying is refused while the filter runs, with no questions, for an unknown campaign and for a member", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, services, campaign, leads, context } = await setup(
      database,
      1,
    );
    await runAll(services, campaign.campaignId);
    const member = await createAuthenticatedApp({
      context,
      email: "reapply-member@example.com",
    });

    await context.repositories.campaignLead.setStatus(
      { campaignId: campaign.campaignId, leadId: leads[0]?.leadId ?? 0 },
      { status: "running", failureReason: null },
    );
    const running = await admin.post(`${path}/filter/reapply`);
    await context.repositories.campaignLead.setStatus(
      { campaignId: campaign.campaignId, leadId: leads[0]?.leadId ?? 0 },
      { status: "done", failureReason: null },
    );
    await admin.put(`${path}/filter`, { context: null, questions: [] });
    const empty = await admin.post(`${path}/filter/reapply`);
    const missing = await admin.post("/api/campaigns/999999/filter/reapply");
    const forbidden = await member.app.request(`${path}/filter/reapply`, {
      method: "POST",
      headers: { cookie: member.cookie },
    });

    expect([
      running.status,
      empty.status,
      missing.status,
      forbidden.status,
    ]).toEqual([409, 400, 404, 403]);
    const [row] = await database.db.select().from(leadAssessmentsTable);
    expect(row?.verdict).toBe("qualified");
  });
});

// ---- signals and re-applying, more closely ----

test("a signal question is stored with its role and an unknown role is refused without touching the saved questions", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, campaign } = await setup(database);

    const saved = await admin.put(`${path}/filter`, {
      context: null,
      questions: [question({ label: "Uses other tools?", role: "signal" })],
    });
    const refused = await admin.put(`${path}/filter`, {
      context: null,
      questions: [{ ...question({ label: "Bogus" }), role: "bonus" }],
    });

    expect([saved.status, refused.status]).toEqual([200, 400]);
    const rows = await database.db
      .select()
      .from(campaignFilterQuestionsTable)
      .where(eq(campaignFilterQuestionsTable.campaignId, campaign.campaignId));
    expect(rows.map((row) => [row.label, row.role])).toEqual([
      ["Uses other tools?", "signal"],
    ]);
  });
});

test("signal answers of no or unknown leave a lead qualified and are kept in its assessment with their role", async () => {
  await withTestDatabase(async (database) => {
    const { services, campaign, classifier, leads } = await setup(database, 1);
    classifier.answer = (input) => ({
      answers: input.questions.map((q, index) => ({
        questionId: q.questionId,
        answer:
          q.role === "competitor"
            ? "no"
            : q.role === "signal"
              ? index % 2 === 0
                ? "no"
                : "unknown"
              : "yes",
        evidence:
          q.role === "competitor" || q.role === "signal"
            ? null
            : (input.facts.split("\n")[0] ?? null),
      })),
      summary: "Fits, few signals.",
      model: "fake",
    });

    await runAll(services, campaign.campaignId);

    const [row] = await database.db.select().from(leadAssessmentsTable);
    expect(row?.verdict).toBe("qualified");
    expect(
      row?.answers
        .filter((answer) => answer.role === "signal")
        .map((answer) => answer.answer),
    ).toEqual(["no", "unknown"]);
    expect(
      await rowOf(database.db, campaign.campaignId, leads[0]?.leadId ?? 0),
    ).toMatchObject({ status: "done", failureReason: null });
  });
});

test("re-applying twice changes nothing the second time, keeps the stored evidence, summary and model, and leaves another campaign alone", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, services, campaign, context, leads } = await setup(
      database,
      1,
    );
    await runAll(services, campaign.campaignId);
    const other = await context.repositories.campaign.create({
      name: "Other",
      keywords: ["other"],
      types: ["public"],
      pricingModels: ["paid"],
      status: "active",
    });
    await context.repositories.campaignFilter.replaceQuestions({
      campaignId: other.campaignId,
      questions: sampleFilterQuestions,
    });
    const [original] = await database.db
      .select()
      .from(leadAssessmentsTable)
      .where(eq(leadAssessmentsTable.campaignId, campaign.campaignId));
    await context.repositories.leadAssessment.upsert({
      campaignId: other.campaignId,
      leadId: leads[0]?.leadId ?? 0,
      verdict: "qualified",
      summary: "Other campaign",
      answers: original?.answers ?? [],
      model: "other-model",
    });

    await admin.put(`${path}/filter`, {
      context: null,
      questions: sampleFilterQuestions.map((q) =>
        q.role === "evidence" ? { ...q, role: "disqualifier" } : q,
      ),
    });
    const first = await admin.post(`${path}/filter/reapply`);
    const second = await admin.post(`${path}/filter/reapply`);

    expect(await first.json()).toEqual({ total: 1, changed: 1, skipped: 0 });
    expect(await second.json()).toEqual({ total: 1, changed: 0, skipped: 0 });
    const [after] = await database.db
      .select()
      .from(leadAssessmentsTable)
      .where(eq(leadAssessmentsTable.campaignId, campaign.campaignId));
    expect(after).toMatchObject({
      verdict: "disqualified",
      summary: original?.summary,
      model: original?.model,
    });
    expect(after?.answers.map((a) => [a.label, a.answer, a.evidence])).toEqual(
      original?.answers.map((a) => [a.label, a.answer, a.evidence]),
    );
    const [untouched] = await database.db
      .select()
      .from(leadAssessmentsTable)
      .where(eq(leadAssessmentsTable.campaignId, other.campaignId));
    expect(untouched).toMatchObject({
      verdict: "qualified",
      summary: "Other campaign",
      model: "other-model",
    });
    expect(untouched?.answers.map((a) => a.role)).toEqual(
      original?.answers.map((a) => a.role),
    );
  });
});

test("re-applying updates every assessment but moves only the leads that finished stage 2", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, services, campaign, leads, context } = await setup(
      database,
      3,
    );
    await runAll(services, campaign.campaignId);
    const [queued, past] = [leads[0]?.leadId ?? 0, leads[1]?.leadId ?? 0];
    await context.repositories.campaignLead.setStatus(
      { campaignId: campaign.campaignId, leadId: queued },
      { status: "pending", failureReason: null },
    );
    await database.db
      .update(campaignLeadsTable)
      .set({ stage: 3 })
      .where(eq(campaignLeadsTable.leadId, past));

    await admin.put(`${path}/filter`, {
      context: null,
      questions: sampleFilterQuestions.map((q) =>
        q.role === "evidence" ? { ...q, role: "disqualifier" } : q,
      ),
    });
    const response = await admin.post(`${path}/filter/reapply`);

    expect(await response.json()).toEqual({ total: 3, changed: 3, skipped: 0 });
    expect(
      (await database.db.select().from(leadAssessmentsTable)).map(
        (row) => row.verdict,
      ),
    ).toEqual(["disqualified", "disqualified", "disqualified"]);
    expect(await rowOf(database.db, campaign.campaignId, queued)).toMatchObject(
      { stage: 2, status: "pending", failureReason: null },
    );
    expect(await rowOf(database.db, campaign.campaignId, past)).toMatchObject({
      stage: 3,
      status: "done",
    });
    expect(
      await rowOf(database.db, campaign.campaignId, leads[2]?.leadId ?? 0),
    ).toMatchObject({
      stage: 2,
      status: "failed",
      failureReason: "Disqualified",
    });
  });
});

test("a question that is switched off or never answered while off does not stop a lead from being re-applied", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, services, campaign } = await setup(database, 1);
    await runAll(services, campaign.campaignId);

    await admin.put(`${path}/filter`, {
      context: null,
      questions: [
        ...sampleFilterQuestions.map((q) =>
          q.role === "signal" ? { ...q, enabled: false } : q,
        ),
        question({ label: "Added while off", enabled: false }),
      ],
    });
    const response = await admin.post(`${path}/filter/reapply`);

    expect(await response.json()).toEqual({ total: 1, changed: 0, skipped: 0 });
    const [row] = await database.db.select().from(leadAssessmentsTable);
    expect(row?.verdict).toBe("qualified");
  });
});

test("changing what an unknown answer means turns a stored review into a disqualification", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, services, campaign, classifier, leads } = await setup(
      database,
      1,
    );
    classifier.answer = (input) => ({
      answers: input.questions.map((q) => ({
        questionId: q.questionId,
        answer:
          q.label === "Is this a commercial business?"
            ? "unknown"
            : q.role === "competitor"
              ? "no"
              : "yes",
        evidence:
          q.label === "Is this a commercial business?" ||
          q.role === "competitor"
            ? null
            : (input.facts.split("\n")[0] ?? null),
      })),
      summary: "Unclear if it earns.",
      model: "fake",
    });
    await runAll(services, campaign.campaignId);
    const [before] = await database.db.select().from(leadAssessmentsTable);
    expect(before?.verdict).toBe("needs_review");

    await admin.put(`${path}/filter`, {
      context: null,
      questions: sampleFilterQuestions.map((q) =>
        q.label === "Is this a commercial business?"
          ? { ...q, onUnknown: "disqualify" }
          : q,
      ),
    });
    await admin.post(`${path}/filter/reapply`);

    const [after] = await database.db.select().from(leadAssessmentsTable);
    expect(after?.verdict).toBe("disqualified");
    expect(
      await rowOf(database.db, campaign.campaignId, leads[0]?.leadId ?? 0),
    ).toMatchObject({ status: "failed", failureReason: "Disqualified" });
  });
});

import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import z from "zod";
import type { FilterQuestionInput } from "@repo/constants/filter";
import {
  campaignFilterQuestionsTable,
  campaignLeadsTable,
  campaignsTable,
  leadAssessmentsTable,
} from "@server/infrastructure/database/schemas";
import { Services } from "@server/services";
import { sampleFilterQuestions } from "@server/testing/filter-questions";
import { createAdminClient, seedCommunity, seedLead } from "./helpers/api";
import { callData, issueToken, setup } from "./helpers/mcp";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";

type Session = Awaited<ReturnType<typeof setup>>;

const call = (session: Session, name: string, args: object) =>
  callData(session.admin.app, session.token, name, args);

const questionsOf = async (session: Session, campaignId: number) =>
  await session.context.repositories.campaignFilter.listQuestions({
    campaignId,
  });

/** An active campaign with the sample questions and leads that finished stage 1 */
const seedCampaign = async (session: Session, leadCount = 2) => {
  const { context } = session;
  const campaign = await context.repositories.campaign.create({
    name: "Agent filter",
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
      skoolUsername: `agent-lead-${index}`,
      name: `Agent lead ${index}`,
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

  return { campaign, leads, services: new Services({ context }) };
};

const runThrough = async (services: Services, campaignId: number) => {
  await services.filter.start({ campaignId });
  await services.filter.runCampaign({ campaignId });
};

const asFilter = (data: unknown) =>
  z
    .object({
      context: z.string().nullable(),
      questions: z.array(
        z.object({
          label: z.string(),
          role: z.string(),
          onUnknown: z.string(),
          enabled: z.boolean(),
        }),
      ),
    })
    .parse(data);

// ---- get_filter and save_filter ----

test("an agent saves a campaign's AI filter, reads it back, and a second save replaces the whole list", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const { campaign } = await seedCampaign(session);
    session.context.eventBus.published.length = 0;
    const questions: FilterQuestionInput[] = [
      {
        label: "Sells to coaches?",
        guidance: "Mentions coaches",
        role: "requirement",
        onUnknown: "disqualify",
        enabled: true,
      },
      {
        label: "Has a podcast?",
        guidance: "",
        role: "signal",
        onUnknown: "review",
        enabled: false,
      },
    ];

    const saved = await call(session, "save_filter", {
      campaignId: campaign.campaignId,
      context: "Sell automation to coaches",
      questions,
    });

    expect(saved.isError).toBe(false);
    const stored = await questionsOf(session, campaign.campaignId);
    expect(
      stored.map((q) => [q.label, q.role, q.onUnknown, q.enabled, q.position]),
    ).toEqual([
      ["Sells to coaches?", "requirement", "disqualify", true, 0],
      ["Has a podcast?", "signal", "review", false, 1],
    ]);
    const [row] = await db
      .select()
      .from(campaignsTable)
      .where(eq(campaignsTable.campaignId, campaign.campaignId));
    expect(row?.filterContext).toBe("Sell automation to coaches");
    expect(session.context.eventBus.published).toContain("campaigns.changed");

    const read = await call(session, "get_filter", {
      campaignId: campaign.campaignId,
    });
    expect(asFilter(read.data)).toMatchObject({
      context: "Sell automation to coaches",
      questions: [
        { label: "Sells to coaches?", role: "requirement", enabled: true },
        { label: "Has a podcast?", role: "signal", enabled: false },
      ],
    });

    await call(session, "save_filter", {
      campaignId: campaign.campaignId,
      context: null,
      questions: [questions[0]],
    });
    expect(
      (await questionsOf(session, campaign.campaignId)).map((q) => q.label),
    ).toEqual(["Sells to coaches?"]);
  });
});

const invalidFilters: [string, object][] = [
  ["an empty question", { label: "  " }],
  ["a question over 255 characters", { label: "q".repeat(256) }],
  ["guidance over 2000 characters", { guidance: "g".repeat(2001) }],
  ["a role that does not exist", { role: "bonus" }],
  ["an unknown rule for unclear answers", { onUnknown: "ignore" }],
];

for (const [label, change] of invalidFilters) {
  test(`saving ${label} is refused and the saved filter is unchanged`, async () => {
    await withTestDatabase(async ({ db, pool }) => {
      const session = await setup(db, pool);
      const { campaign } = await seedCampaign(session);
      const before = await questionsOf(session, campaign.campaignId);

      const result = await call(session, "save_filter", {
        campaignId: campaign.campaignId,
        context: "New context",
        questions: [{ ...sampleFilterQuestions[0], ...change }],
      });

      // Input is validated before any write, so a refusal can only leave the rows as they were
      expect(result.isError).toBe(true);
      expect(await questionsOf(session, campaign.campaignId)).toEqual(before);
      const [row] = await db.select().from(campaignsTable);
      expect(row?.filterContext).toBeNull();
    });
  });
}

test("thirteen questions are refused and twelve are stored", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const { campaign } = await seedCampaign(session);
    const many = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        ...sampleFilterQuestions[0],
        label: `Question ${index}`,
      }));

    const tooMany = await call(session, "save_filter", {
      campaignId: campaign.campaignId,
      context: null,
      questions: many(13),
    });
    expect(tooMany.isError).toBe(true);
    expect(await db.$count(campaignFilterQuestionsTable)).toBe(
      sampleFilterQuestions.length,
    );

    const ok = await call(session, "save_filter", {
      campaignId: campaign.campaignId,
      context: null,
      questions: many(12),
    });
    expect(ok.isError).toBe(false);
    expect(await db.$count(campaignFilterQuestionsTable)).toBe(12);
  });
});

test("a campaign that does not exist cannot be read, saved to, run or re-applied, and nothing is written", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    await seedCampaign(session);
    const questions = await db.$count(campaignFilterQuestionsTable);
    const campaignId = 999_999;

    const results = await Promise.all([
      call(session, "get_filter", { campaignId }),
      call(session, "save_filter", {
        campaignId,
        context: null,
        questions: [sampleFilterQuestions[0]],
      }),
      call(session, "show_filter_prompt", {
        campaignId,
        context: null,
        questions: [sampleFilterQuestions[0]],
      }),
      call(session, "run_filter", { campaignId }),
      call(session, "reapply_filter", { campaignId }),
      call(session, "list_campaign_leads", { campaignId }),
      call(session, "get_assessment", { campaignId, leadId: 1 }),
    ]);

    // Each of these looks the campaign up before anything else, so a 404 happens before any write
    expect(results.map((result) => result.isError)).toEqual(
      results.map(() => true),
    );
    expect(await db.$count(campaignFilterQuestionsTable)).toBe(questions);
    expect(await db.$count(leadAssessmentsTable)).toBe(0);
  });
});

// ---- show_filter_prompt ----

test("showing the prompt matches the platform's own prompt and writes nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const { campaign } = await seedCampaign(session);
    const settings = {
      context: "Sell automation to coaches",
      questions: sampleFilterQuestions.slice(0, 2),
    };
    const before = await questionsOf(session, campaign.campaignId);

    const shown = await call(session, "show_filter_prompt", {
      campaignId: campaign.campaignId,
      ...settings,
    });
    const platformAdmin = await createAdminClient(
      session.context,
      "platform-prompt@example.com",
    );
    const platform = await platformAdmin.post(
      `/api/campaigns/${campaign.campaignId}/filter/prompt`,
      settings,
    );

    expect(shown.isError).toBe(false);
    expect(shown.data).toEqual(await platform.json());
    expect(z.object({ prompt: z.string() }).parse(shown.data).prompt).toContain(
      "WHAT WE ARE TRYING TO DO:\nSell automation to coaches",
    );
    expect(session.classifier.calls).toHaveLength(0);
    expect(await questionsOf(session, campaign.campaignId)).toEqual(before);
  });
});

test("a prompt with every question switched off is refused", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const { campaign } = await seedCampaign(session);

    const result = await call(session, "show_filter_prompt", {
      campaignId: campaign.campaignId,
      context: null,
      questions: [{ ...sampleFilterQuestions[0], enabled: false }],
    });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("Switch on at least one question");
  });
});

// ---- run_filter and the results ----

test("an agent runs the AI filter and reads each lead's verdict and assessment", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const { campaign, leads, services } = await seedCampaign(session, 2);
    session.classifier.answer = (input) => {
      const index = Number(input.leadUsername.split("-")[2]);

      return {
        answers: input.questions.map((q) => ({
          questionId: q.questionId,
          answer:
            q.role === "competitor" ? (index === 1 ? "yes" : "no") : "yes",
          evidence:
            q.role === "competitor" && index !== 1
              ? null
              : (input.facts.split("\n")[0] ?? null),
        })),
        summary: index === 1 ? "A rival." : "A fit.",
        model: "fake",
      };
    };

    const started = await call(session, "run_filter", {
      campaignId: campaign.campaignId,
    });

    expect(started.isError).toBe(false);
    expect(started.data).toEqual({ queued: 2 });
    const moved = await db
      .select()
      .from(campaignLeadsTable)
      .where(eq(campaignLeadsTable.campaignId, campaign.campaignId));
    expect(
      moved.every((row) => row.stage === 2 && row.status === "pending"),
    ).toBe(true);

    await services.filter.runCampaign({ campaignId: campaign.campaignId });

    const assessments = await db.select().from(leadAssessmentsTable);
    const verdictOf = (leadId: number | undefined) =>
      assessments.find((row) => row.leadId === leadId)?.verdict;
    expect(assessments).toHaveLength(2);
    expect([verdictOf(leads[0]?.leadId), verdictOf(leads[1]?.leadId)]).toEqual([
      "qualified",
      "competitor",
    ]);

    const listed = await call(session, "list_campaign_leads", {
      campaignId: campaign.campaignId,
      stage: 2,
    });
    const body = z
      .object({
        leads: z.array(
          z.object({
            leadId: z.number(),
            stage: z.number(),
            status: z.string(),
            failureReason: z.string().nullable(),
            verdict: z.string().nullable(),
          }),
        ),
      })
      .parse(listed.data);
    expect(
      body.leads.map((lead) => [
        lead.leadId,
        lead.status,
        lead.failureReason,
        lead.verdict,
      ]),
    ).toEqual(
      expect.arrayContaining([
        [leads[0]?.leadId, "done", null, "qualified"],
        [leads[1]?.leadId, "failed", "Competitor", "competitor"],
      ]),
    );

    const assessment = await call(session, "get_assessment", {
      campaignId: campaign.campaignId,
      leadId: leads[1]?.leadId,
    });
    const [stored] = await db
      .select()
      .from(leadAssessmentsTable)
      .where(
        and(
          eq(leadAssessmentsTable.campaignId, campaign.campaignId),
          eq(leadAssessmentsTable.leadId, leads[1]?.leadId ?? 0),
        ),
      );
    expect(assessment.data).toMatchObject({
      assessment: {
        verdict: "competitor",
        summary: "A rival.",
        answers: stored?.answers,
      },
    });
  });
});

test("list_campaign_leads filters by stage and status and pages like the platform", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const { campaign, services } = await seedCampaign(session, 3);
    await runThrough(services, campaign.campaignId);

    const idsFromTool = async (args: object) =>
      z
        .object({ leads: z.array(z.object({ leadId: z.number() })) })
        .parse(
          (
            await call(session, "list_campaign_leads", {
              campaignId: campaign.campaignId,
              ...args,
            })
          ).data,
        )
        .leads.map((lead) => lead.leadId);
    const platformAdmin = await createAdminClient(
      session.context,
      "platform-leads@example.com",
    );
    const idsFromPlatform = async (query: string) =>
      z
        .object({ leads: z.array(z.object({ leadId: z.number() })) })
        .parse(
          await (
            await platformAdmin.get(
              `/api/campaigns/${campaign.campaignId}/leads?${query}`,
            )
          ).json(),
        )
        .leads.map((lead) => lead.leadId);

    expect(await idsFromTool({ stage: 2, status: "done" })).toEqual(
      await idsFromPlatform("stage=2&status=done"),
    );
    expect(await idsFromTool({ stage: 1 })).toEqual([]);
    expect(await idsFromTool({ page: 2 })).toEqual([]);
  });
});

test("running the filter on a campaign that is not active is refused and no lead moves", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const { campaign } = await seedCampaign(session);
    await db
      .update(campaignsTable)
      .set({ status: "draft" })
      .where(eq(campaignsTable.campaignId, campaign.campaignId));

    const result = await call(session, "run_filter", {
      campaignId: campaign.campaignId,
    });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("Activate the campaign");
    const rows = await db.select().from(campaignLeadsTable);
    expect(rows.every((row) => row.stage === 1 && row.status === "done")).toBe(
      true,
    );
    expect(session.classifier.calls).toHaveLength(0);
  });
});

test("running the filter with no AI set up is refused and no lead moves", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const { campaign } = await seedCampaign(session);
    session.classifier.configured = false;

    const result = await call(session, "run_filter", {
      campaignId: campaign.campaignId,
    });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("OPENAI_API_KEY");
    expect(
      (await db.select().from(campaignLeadsTable)).every(
        (row) => row.stage === 1,
      ),
    ).toBe(true);
  });
});

test("a second run while leads are running is refused, and a lead already judged is not asked again", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const { campaign, leads, services } = await seedCampaign(session, 2);
    await runThrough(services, campaign.campaignId);
    const asked = session.classifier.calls.length;

    await session.context.repositories.campaignLead.setStatus(
      { campaignId: campaign.campaignId, leadId: leads[0]?.leadId ?? 0 },
      { status: "running", failureReason: null },
    );
    const busy = await call(session, "run_filter", {
      campaignId: campaign.campaignId,
    });
    await session.context.repositories.campaignLead.setStatus(
      { campaignId: campaign.campaignId, leadId: leads[0]?.leadId ?? 0 },
      { status: "done", failureReason: null },
    );
    const idle = await call(session, "run_filter", {
      campaignId: campaign.campaignId,
    });

    expect(busy.isError).toBe(true);
    expect(busy.text).toContain("already running");
    // Nobody is waiting any more, so there is nothing to ask the AI about
    expect(idle.isError).toBe(true);
    expect(session.classifier.calls).toHaveLength(asked);
    expect(await db.$count(leadAssessmentsTable)).toBe(2);
  });
});

test("getting the assessment of a lead that was never judged, or does not exist, is an error", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const { campaign, leads } = await seedCampaign(session);

    const unjudged = await call(session, "get_assessment", {
      campaignId: campaign.campaignId,
      leadId: leads[0]?.leadId,
    });
    const missing = await call(session, "get_assessment", {
      campaignId: campaign.campaignId,
      leadId: 999_999,
    });

    expect([unjudged.isError, missing.isError]).toEqual([true, true]);
    expect(unjudged.text).toContain("has not been assessed");
  });
});

// ---- reapply_filter ----

test("an agent changes a question's role and re-applies the rules, and the AI is not asked again", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const { campaign, leads, services } = await seedCampaign(session, 2);
    await runThrough(services, campaign.campaignId);
    const asked = session.classifier.calls.length;
    const changed = sampleFilterQuestions.map((q) =>
      q.label === "Is this a commercial business?"
        ? { ...q, role: "disqualifier" as const }
        : q,
    );

    await call(session, "save_filter", {
      campaignId: campaign.campaignId,
      context: null,
      questions: changed,
    });
    const result = await call(session, "reapply_filter", {
      campaignId: campaign.campaignId,
    });

    expect(result.data).toEqual({ total: 2, changed: 2, skipped: 0 });
    expect(
      (await db.select().from(leadAssessmentsTable)).map((r) => r.verdict),
    ).toEqual(["disqualified", "disqualified"]);
    const rows = await db.select().from(campaignLeadsTable);
    expect(
      rows
        .filter((row) => leads.some((lead) => lead.leadId === row.leadId))
        .every(
          (row) =>
            row.stage === 2 &&
            row.status === "failed" &&
            row.failureReason === "Disqualified",
        ),
    ).toBe(true);
    expect(session.classifier.calls).toHaveLength(asked);
  });
});

test("re-applying while the filter runs, or with no questions, is refused and no verdict changes", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const { campaign, leads, services } = await seedCampaign(session, 1);
    await runThrough(services, campaign.campaignId);

    await session.context.repositories.campaignLead.setStatus(
      { campaignId: campaign.campaignId, leadId: leads[0]?.leadId ?? 0 },
      { status: "running", failureReason: null },
    );
    const running = await call(session, "reapply_filter", {
      campaignId: campaign.campaignId,
    });
    await session.context.repositories.campaignLead.setStatus(
      { campaignId: campaign.campaignId, leadId: leads[0]?.leadId ?? 0 },
      { status: "done", failureReason: null },
    );
    await call(session, "save_filter", {
      campaignId: campaign.campaignId,
      context: null,
      questions: [],
    });
    const empty = await call(session, "reapply_filter", {
      campaignId: campaign.campaignId,
    });

    expect([running.isError, empty.isError]).toEqual([true, true]);
    const [row] = await db.select().from(leadAssessmentsTable);
    expect(row?.verdict).toBe("qualified");
  });
});

// ---- the tools themselves ----

test("the new tools are marked read-only or not, and the paid run says it reaches outside", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);

    const response = await session.admin.app.request("/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    const tools = z
      .object({
        result: z.object({
          tools: z.array(
            z.object({
              name: z.string(),
              annotations: z.object({
                readOnlyHint: z.boolean(),
                openWorldHint: z.boolean(),
                destructiveHint: z.boolean(),
              }),
            }),
          ),
        }),
      })
      .parse(await response.json()).result.tools;
    const hints = (name: string) =>
      tools.find((tool) => tool.name === name)?.annotations;

    for (const name of [
      "get_filter",
      "show_filter_prompt",
      "list_campaign_leads",
      "get_assessment",
    ]) {
      expect(hints(name)).toMatchObject({
        readOnlyHint: true,
        openWorldHint: false,
      });
    }
    for (const name of ["save_filter", "reapply_filter", "run_filter"]) {
      expect(hints(name)).toMatchObject({
        readOnlyHint: false,
        destructiveHint: false,
      });
    }
    expect(hints("run_filter")?.openWorldHint).toBe(true);
    expect(hints("reapply_filter")?.openWorldHint).toBe(false);
  });
});

test("a member's token cannot use the stage 2 tools", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const { campaign } = await seedCampaign(session);
    const member = await createAuthenticatedApp({
      context: session.context,
      email: "filter-agent-member@example.com",
    });
    const token = await issueToken(db, member.user.userId, "member-filter");

    const response = await member.app.request("/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "run_filter",
          arguments: { campaignId: campaign.campaignId },
        },
      }),
    });

    expect(response.status).toBe(403);
    expect(
      (await db.select().from(campaignLeadsTable)).every(
        (row) => row.stage === 1,
      ),
    ).toBe(true);
  });
});

import { sampleFilterQuestions } from "@repo/server/testing/e2e-seed";
import { test, expect } from "../fixtures";
import { callTool, connectViaApi, field } from "./mcp-support";
import { token } from "./support";

const quote = "We run coaching programs.";

const qualifiedScript = {
  answers: Object.fromEntries(
    sampleFilterQuestions.map((question) => [
      question.label,
      question.role === "competitor"
        ? { answer: "no" as const }
        : { answer: "yes" as const, evidence: quote },
    ]),
  ),
  summary: "Scripted qualified.",
};

test("an agent sets up the AI filter, runs it, reads the verdict and re-applies new rules, and the dashboard shows each change", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const username = `e2e-${id}-mcp`;
  const campaign = await seed.createCampaign({
    name: `Agent filter ${id}`,
    status: "active",
  });
  const lead = await seed.createLead({
    skoolUsername: username,
    name: `Agent lead ${id}`,
    bio: `Founder. ${quote}`,
  });
  await seed.scriptLeadAssessment(username, qualifiedScript);
  await seed.attachCampaignLeads({
    campaignId: campaign.campaignId,
    leads: [{ leadId: lead.leadId, stage: 1, status: "done" }],
  });

  try {
    const { accessToken } = await connectViaApi(page.context().request);
    const agent = (name: string, args: object) =>
      callTool(page.context().request, accessToken, name, args);
    const campaignId = campaign.campaignId;

    const saved = await agent("save_filter", {
      campaignId,
      context: `Sell automation to coaches ${id}`,
      questions: sampleFilterQuestions,
    });
    expect(saved.isError).toBe(false);
    const stored = await seed.listFilterQuestions(campaignId);
    expect(stored.map((q) => q.label)).toEqual(
      sampleFilterQuestions.map((q) => q.label),
    );

    const read = await agent("get_filter", { campaignId });
    expect(field(read.value, "context")).toBe(
      `Sell automation to coaches ${id}`,
    );

    const shown = await agent("show_filter_prompt", {
      campaignId,
      context: `Sell automation to coaches ${id}`,
      questions: sampleFilterQuestions,
    });
    expect(String(field(shown.value, "prompt"))).toContain(
      `Sell automation to coaches ${id}`,
    );
    expect(await seed.listLeadAssessments(campaignId)).toEqual([]);

    const started = await agent("run_filter", { campaignId });
    expect(started.value).toEqual({ queued: 1 });
    await expect
      .poll(async () =>
        (await seed.listLeadAssessments(campaignId)).map((a) => a.verdict),
      )
      .toEqual(["qualified"]);

    const listed = await agent("list_campaign_leads", {
      campaignId,
      stage: 2,
      status: "done",
    });
    const leads = field(listed.value, "leads");
    expect(
      Array.isArray(leads) ? leads.map((l) => field(l, "verdict")) : [],
    ).toEqual(["qualified"]);
    const assessment = await agent("get_assessment", {
      campaignId,
      leadId: lead.leadId,
    });
    expect(field(field(assessment.value, "assessment"), "summary")).toBe(
      "Scripted qualified.",
    );

    await page.goto(`/admin/campaigns/${campaignId}?stage=2`);
    const row = page.getByRole("row").filter({ hasText: `Agent lead ${id}` });
    await expect(row.getByRole("button", { name: "Qualified" })).toBeVisible();

    // The script is gone, so only the stored answers can produce the next verdict
    await seed.unscriptLeadAssessment(username);
    const changed = sampleFilterQuestions.map((q) =>
      q.label === "Is this a commercial business?"
        ? { ...q, role: "disqualifier" as const }
        : q,
    );
    await agent("save_filter", {
      campaignId,
      context: null,
      questions: changed,
    });
    const reapplied = await agent("reapply_filter", { campaignId });
    expect(reapplied.value).toEqual({ total: 1, changed: 1, skipped: 0 });

    const [after] = await seed.listLeadAssessments(campaignId);
    expect(after?.verdict).toBe("disqualified");
    const [stage] = await seed.listCampaignLeads(campaignId);
    expect([stage?.stage, stage?.status, stage?.failureReason]).toEqual([
      2,
      "failed",
      "Disqualified",
    ]);
    await page.reload();
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: `Agent lead ${id}` })
        .getByRole("button", { name: "Disqualified" }),
    ).toBeVisible();
  } finally {
    await seed.unscriptLeadAssessment(username);
  }
});

test("an agent cannot run the AI filter on a campaign that is still a draft, and no lead moves", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const campaign = await seed.createCampaign({ name: `Draft ${id}` });
  const lead = await seed.createLead({
    skoolUsername: `e2e-${id}-draft`,
    name: `Draft lead ${id}`,
  });
  await seed.attachCampaignLeads({
    campaignId: campaign.campaignId,
    leads: [{ leadId: lead.leadId, stage: 1, status: "done" }],
  });
  await seed.saveFilterQuestions(campaign.campaignId);
  const { accessToken } = await connectViaApi(page.context().request);

  const refused = await callTool(
    page.context().request,
    accessToken,
    "run_filter",
    { campaignId: campaign.campaignId },
  );

  expect(refused.isError).toBe(true);
  expect(String(refused.value)).toContain("Activate the campaign");
  const [stored] = await seed.listCampaignLeads(campaign.campaignId);
  expect([stored?.stage, stored?.status]).toEqual([1, "done"]);
  expect(await seed.listLeadAssessments(campaign.campaignId)).toEqual([]);
});

import { test, expect } from "../fixtures";
import type { Page } from "@playwright/test";
import { defaultFilterQuestions } from "@repo/constants/filter";
import { expectRequired, token } from "./support";

type Seed = Parameters<Parameters<typeof test>[2]>[0]["seed"];

const field = (page: Page, name: string, index: number) =>
  page.locator(`[id="questions.${index}.${name}"]`);

const questionBoxes = (page: Page) => page.getByLabel(/^Question\s*\*?$/);

const choose = async (
  page: Page,
  trigger: ReturnType<typeof field>,
  option: RegExp,
) => {
  await trigger.click();
  await page.getByRole("option", { name: option }).click();
};

const open = async (page: Page, campaignId: number) => {
  await page.goto(`/admin/campaigns/${campaignId}/filter`);
  await expect(page.getByLabel("What are we trying to do?")).toBeVisible();
};

const saveStarterQuestions = async (page: Page, campaignId: number) => {
  await open(page, campaignId);
  await page.getByRole("button", { name: "Use the starter questions" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("AI filter saved.")).toBeVisible();
};

const setupAdmin = async (
  page: Page,
  seed: Seed,
  input: { status?: "active" } = {},
) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const campaign = await seed.createCampaign({
    name: `Filter ${id}`,
    status: input.status ?? "draft",
  });

  return { id, campaign };
};

const labels = defaultFilterQuestions.map((question) => question.label);

const scriptFor = (
  verdict: "qualified" | "needs_review" | "competitor",
  quote: string,
) => ({
  answers: Object.fromEntries(
    defaultFilterQuestions.map((question, index) => {
      if (question.role === "competitor") {
        return [
          question.label,
          verdict === "competitor"
            ? { answer: "yes" as const, evidence: quote }
            : { answer: "no" as const },
        ];
      }
      if (verdict === "needs_review" && index === 0)
        return [question.label, { answer: "unknown" as const }];

      return [question.label, { answer: "yes" as const, evidence: quote }];
    }),
  ),
  summary: `Scripted ${verdict}.`,
});

test("the starter questions fill the form and are stored in order when saved", async ({
  page,
  seed,
}) => {
  const { campaign } = await setupAdmin(page, seed);
  await open(page, campaign.campaignId);
  await expect(page.getByText("No questions yet")).toBeVisible();

  await page.getByRole("button", { name: "Use the starter questions" }).click();
  await expect(questionBoxes(page)).toHaveCount(6);
  await page.getByRole("button", { name: "Save" }).click();

  await expect
    .poll(async () =>
      (await seed.listFilterQuestions(campaign.campaignId)).map((q) => q.label),
    )
    .toEqual(labels);
  const stored = await seed.listFilterQuestions(campaign.campaignId);
  expect(stored.map((q) => q.role)).toEqual(
    defaultFilterQuestions.map((q) => q.role),
  );
  await page.reload();
  await expect(questionBoxes(page)).toHaveCount(6);
  await expect(questionBoxes(page).first()).toHaveValue(labels[0] ?? "");
});

test("a question without a label is stopped on the form and nothing is stored, and the field is marked required with a placeholder", async ({
  page,
  seed,
}) => {
  const { campaign } = await setupAdmin(page, seed);
  await open(page, campaign.campaignId);
  await page.getByRole("button", { name: "Add a question" }).click();
  await expectRequired(page, "Question", "Is this a commercial business?");
  await expectRequired(page, "What a yes means");
  await expectRequired(page, "If the AI cannot tell");

  await page.getByRole("button", { name: "Save" }).click();

  await expect(page).toHaveURL(/\/filter$/);
  // The form stopped the submit, so no request reached the server and nothing was written
  expect(await seed.listFilterQuestions(campaign.campaignId)).toEqual([]);
});

test("questions can be reordered, switched off, given another role and added, and the context is kept", async ({
  page,
  seed,
}) => {
  const { campaign, id } = await setupAdmin(page, seed);
  await saveStarterQuestions(page, campaign.campaignId);

  await page
    .getByLabel("What are we trying to do?")
    .fill(`Agencies for coaches ${id}`);
  await page.getByRole("button", { name: "Move question 1 down" }).click();
  await page.getByLabel("Question 3 on").click();
  await choose(page, field(page, "role", 3), /Disqualifier/);
  await choose(page, field(page, "onUnknown", 3), /Disqualify/);
  await page.getByRole("button", { name: "Add a question" }).click();
  await questionBoxes(page).last().fill(`Do they hire? ${id}`);
  await page.getByRole("button", { name: "Save" }).click();

  await expect
    .poll(
      async () => (await seed.listFilterQuestions(campaign.campaignId)).length,
    )
    .toBe(7);
  const stored = await seed.listFilterQuestions(campaign.campaignId);
  expect(stored.map((q) => q.label)).toEqual([
    labels[1],
    labels[0],
    ...labels.slice(2),
    `Do they hire? ${id}`,
  ]);
  expect(stored[2]).toMatchObject({ enabled: false });
  expect(stored[3]).toMatchObject({
    role: "disqualifier",
    onUnknown: "disqualify",
  });
  await page.reload();
  await expect(page.getByLabel("What are we trying to do?")).toHaveValue(
    `Agencies for coaches ${id}`,
  );
});

test("removing a question drops it from the saved list", async ({
  page,
  seed,
}) => {
  const { campaign } = await setupAdmin(page, seed);
  await saveStarterQuestions(page, campaign.campaignId);

  await page.getByRole("button", { name: "Remove question 2" }).click();
  await page.getByRole("button", { name: "Save" }).click();

  await expect
    .poll(
      async () => (await seed.listFilterQuestions(campaign.campaignId)).length,
    )
    .toBe(5);
  expect(
    (await seed.listFilterQuestions(campaign.campaignId)).map((q) => q.label),
  ).not.toContain(labels[1]);
});

test("a campaign can hold twelve questions and not a thirteenth", async ({
  page,
  seed,
}) => {
  const { campaign } = await setupAdmin(page, seed);
  await saveStarterQuestions(page, campaign.campaignId);

  for (let index = 0; index < 6; index += 1) {
    await page.getByRole("button", { name: "Add a question" }).click();
  }

  await expect(questionBoxes(page)).toHaveCount(12);
  await expect(
    page.getByRole("button", { name: "Add a question" }),
  ).toBeDisabled();
});

test("the settings page shows a skeleton while the questions load", async ({
  page,
  seed,
}) => {
  const { campaign } = await setupAdmin(page, seed);
  await page.route("**/api/campaigns/*/filter", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.continue();
  });

  await page.goto(`/admin/campaigns/${campaign.campaignId}/filter`);

  await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible();
  await expect(page.getByLabel("What are we trying to do?")).toBeVisible();
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
});

test("trying a lead shows the AI's answers with their evidence and keeps nothing", async ({
  page,
  seed,
}) => {
  const { campaign, id } = await setupAdmin(page, seed);
  await saveStarterQuestions(page, campaign.campaignId);
  const username = `e2e-${id}`;
  const lead = await seed.createLead({
    skoolUsername: username,
    name: `Try ${id}`,
    bio: `Founder of Acme ${id}. We run coaching programs.`,
  });
  await seed.scriptLeadAssessment(
    username,
    scriptFor("qualified", "We run coaching programs."),
  );

  try {
    await page.locator("#preview-lead").fill(`Try ${id}`);
    await page.getByRole("option", { name: new RegExp(`Try ${id}`) }).click();
    await page.getByRole("button", { name: "Try this lead" }).click();

    await expect(page.getByText("Qualified").first()).toBeVisible();
    await expect(page.getByText("Scripted qualified.")).toBeVisible();
    await expect(
      page.getByText("We run coaching programs.").first(),
    ).toBeVisible();
    await expect(page.getByText(labels[0] ?? "").first()).toBeVisible();
    expect(await seed.listLeadAssessments(campaign.campaignId)).toEqual([]);
    expect(lead.leadId).toBeGreaterThan(0);
  } finally {
    await seed.unscriptLeadAssessment(username);
  }
});

test("running the filter classifies every lead, passes the qualified ones and shows each verdict with its evidence", async ({
  page,
  seed,
}) => {
  const { campaign, id } = await setupAdmin(page, seed, { status: "active" });
  await saveStarterQuestions(page, campaign.campaignId);
  const verdicts = ["qualified", "needs_review", "competitor"] as const;
  const quote = "We run coaching programs.";
  const leads = [];
  for (const [index, verdict] of verdicts.entries()) {
    const username = `e2e-${id}-${index}`;
    const lead = await seed.createLead({
      skoolUsername: username,
      name: `${verdict} ${id}`,
      bio: `Founder number ${index}. ${quote}`,
    });
    await seed.scriptLeadAssessment(username, scriptFor(verdict, quote));
    leads.push({ lead, username, verdict });
  }
  await seed.attachCampaignLeads({
    campaignId: campaign.campaignId,
    leads: leads.map(({ lead }) => ({
      leadId: lead.leadId,
      stage: 1,
      status: "done",
    })),
  });

  try {
    await page.goto(`/admin/campaigns/${campaign.campaignId}?stage=2`);
    await page.getByRole("button", { name: "Run AI filter" }).click();

    const row = (verdict: string) =>
      page.getByRole("row").filter({ hasText: `${verdict} ${id}` });
    await expect(
      row("qualified").getByRole("button", { name: "Qualified" }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      row("needs_review").getByRole("button", { name: "Needs review" }),
    ).toBeVisible();
    await expect(
      row("competitor").getByRole("button", { name: "Competitor" }),
    ).toBeVisible();

    const assessments = await seed.listLeadAssessments(campaign.campaignId);
    expect(assessments.map((a) => a.verdict)).toEqual([
      "qualified",
      "needs_review",
      "competitor",
    ]);
    const stored = await seed.listCampaignLeads(campaign.campaignId);
    expect(
      stored.map((lead) => [lead.stage, lead.status, lead.failureReason]),
    ).toEqual([
      [2, "done", null],
      [2, "failed", "Needs review"],
      [2, "failed", "Competitor"],
    ]);

    await row("qualified").getByRole("button", { name: "Qualified" }).click();
    const sheet = page.locator('[data-slot="sheet-content"]');
    await expect(sheet).toContainText("Scripted qualified.");
    await expect(sheet).toContainText(labels[0] ?? "");
    await expect(sheet).toContainText(quote);
  } finally {
    for (const { username } of leads)
      await seed.unscriptLeadAssessment(username);
  }
});

test("a campaign that is not active cannot run the filter", async ({
  page,
  seed,
}) => {
  const { campaign } = await setupAdmin(page, seed);

  await page.goto(`/admin/campaigns/${campaign.campaignId}?stage=2`);

  await expect(
    page.getByRole("button", { name: "Run AI filter" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Activate the campaign to run its stages."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "AI filter settings" }),
  ).toBeVisible();
});

test("a lead the AI cannot be asked about fails with its reason, gets no assessment and the others still finish", async ({
  page,
  seed,
}) => {
  const { campaign, id } = await setupAdmin(page, seed, { status: "active" });
  await saveStarterQuestions(page, campaign.campaignId);
  const quote = "We run coaching programs.";
  const good = await seed.createLead({
    skoolUsername: `e2e-${id}-good`,
    name: `Good ${id}`,
    bio: `Founder. ${quote}`,
  });
  const silent = await seed.createLead({
    skoolUsername: `e2e-${id}-silent`,
    name: `Silent ${id}`,
    bio: "Nothing scripted.",
  });
  await seed.scriptLeadAssessment(
    `e2e-${id}-good`,
    scriptFor("qualified", quote),
  );
  await seed.attachCampaignLeads({
    campaignId: campaign.campaignId,
    leads: [good, silent].map((lead) => ({
      leadId: lead.leadId,
      stage: 1,
      status: "done",
    })),
  });

  try {
    await page.goto(`/admin/campaigns/${campaign.campaignId}?stage=2`);
    await page.getByRole("button", { name: "Run AI filter" }).click();

    await expect(
      page
        .getByRole("row")
        .filter({ hasText: `Good ${id}` })
        .getByRole("button", { name: "Qualified" }),
    ).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(async () =>
        (await seed.listCampaignLeads(campaign.campaignId)).map(
          (lead) => lead.status,
        ),
      )
      .toEqual(["done", "failed"]);
    const stored = await seed.listCampaignLeads(campaign.campaignId);
    expect(stored[1]?.failureReason).toContain("No scripted answers");
    expect(
      (await seed.listLeadAssessments(campaign.campaignId)).map(
        (a) => a.leadId,
      ),
    ).toEqual([good.leadId]);
    await expect(
      page.getByRole("row").filter({ hasText: `Silent ${id}` }),
    ).toContainText("—");
  } finally {
    await seed.unscriptLeadAssessment(`e2e-${id}-good`);
  }
});

test("running the filter again only asks about leads that never got an answer", async ({
  page,
  seed,
}) => {
  const { campaign, id } = await setupAdmin(page, seed, { status: "active" });
  await saveStarterQuestions(page, campaign.campaignId);
  const quote = "We run coaching programs.";
  const lead = await seed.createLead({
    skoolUsername: `e2e-${id}`,
    name: `Again ${id}`,
    bio: `Founder. ${quote}`,
  });
  await seed.attachCampaignLeads({
    campaignId: campaign.campaignId,
    leads: [{ leadId: lead.leadId, stage: 1, status: "done" }],
  });

  try {
    await page.goto(`/admin/campaigns/${campaign.campaignId}?stage=2`);
    await page.getByRole("button", { name: "Run AI filter" }).click();
    await expect
      .poll(
        async () =>
          (await seed.listCampaignLeads(campaign.campaignId))[0]?.status,
      )
      .toBe("failed");

    await seed.scriptLeadAssessment(`e2e-${id}`, scriptFor("qualified", quote));
    await page.getByRole("button", { name: "Run AI filter" }).click();

    await expect(
      page
        .getByRole("row")
        .filter({ hasText: `Again ${id}` })
        .getByRole("button", { name: "Qualified" }),
    ).toBeVisible({ timeout: 20_000 });
    expect(
      (await seed.listLeadAssessments(campaign.campaignId)).map(
        (a) => a.verdict,
      ),
    ).toEqual(["qualified"]);
  } finally {
    await seed.unscriptLeadAssessment(`e2e-${id}`);
  }
});

const promptSheet = (page: Page) => page.locator('[data-slot="sheet-content"]');

test("Show prompt writes out what the AI is sent for the form as it is now, saved or not, and copies it", async ({
  page,
  seed,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const { campaign, id } = await setupAdmin(page, seed);
  await saveStarterQuestions(page, campaign.campaignId);

  await page
    .getByLabel("What are we trying to do?")
    .fill(`Sell automation to coaches ${id}`);
  await questionBoxes(page).first().fill(`Unsaved question ${id}`);
  await page.getByLabel("Question 2 on").click();
  await page.getByRole("button", { name: "Show prompt" }).click();

  const sheet = promptSheet(page);
  await expect(sheet).toContainText("The prompt");
  await expect(sheet).toContainText("Use ONLY the text provided under LEAD");
  await expect(sheet).toContainText(`WHAT WE ARE TRYING TO DO:`);
  await expect(sheet).toContainText(`Sell automation to coaches ${id}`);
  await expect(sheet).toContainText(`- questionId 1: Unsaved question ${id}`);
  await expect(sheet).not.toContainText(labels[1] ?? "");
  await expect(sheet).toContainText("QUESTIONS:");
  await expect(sheet).toContainText("LEAD:");

  await sheet.getByRole("button", { name: "Copy" }).nth(1).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain(`Sell automation to coaches ${id}`);
  expect(copied).toContain(`- questionId 1: Unsaved question ${id}`);

  // Showing a prompt saves nothing
  const stored = await seed.listFilterQuestions(campaign.campaignId);
  expect(stored.map((q) => q.label)).toEqual(labels);
  expect(stored.every((q) => q.enabled)).toBe(true);
});

test("Show prompt with a lead picked includes that lead's own text", async ({
  page,
  seed,
}) => {
  const { campaign, id } = await setupAdmin(page, seed);
  await saveStarterQuestions(page, campaign.campaignId);
  await seed.createLead({
    skoolUsername: `e2e-${id}`,
    name: `Prompt ${id}`,
    bio: `Founder of Acme ${id}. We run coaching programs.`,
  });

  await page.locator("#preview-lead").fill(`Prompt ${id}`);
  await page.getByRole("option", { name: new RegExp(`Prompt ${id}`) }).click();
  await page.getByRole("button", { name: "Show prompt" }).click();

  await expect(promptSheet(page)).toContainText(`Name: Prompt ${id}`);
  await expect(promptSheet(page)).toContainText(
    `Bio: Founder of Acme ${id}. We run coaching programs.`,
  );
});

test("Show prompt is stopped by an invalid form, and says so when every question is off", async ({
  page,
  seed,
}) => {
  const { campaign } = await setupAdmin(page, seed);
  await saveStarterQuestions(page, campaign.campaignId);
  let requests = 0;
  await page.route("**/api/campaigns/*/filter/prompt", async (route) => {
    requests += 1;
    await route.continue();
  });

  await questionBoxes(page).first().fill("");
  await page.getByRole("button", { name: "Show prompt" }).click();
  await expect(promptSheet(page)).toHaveCount(0);
  expect(requests).toBe(0);

  await questionBoxes(page).first().fill("Back again?");
  for (let index = 1; index <= 6; index += 1) {
    await page.getByLabel(`Question ${index} on`).click();
  }
  await page.getByRole("button", { name: "Show prompt" }).click();

  await expect(
    page.getByText("Switch on at least one question to see the prompt."),
  ).toBeVisible();
  await expect(promptSheet(page)).toHaveCount(0);
});

test("re-applying the rules after a role change gives the lead a new verdict from its stored answers without asking the AI again", async ({
  page,
  seed,
}) => {
  const { campaign, id } = await setupAdmin(page, seed, { status: "active" });
  await saveStarterQuestions(page, campaign.campaignId);
  const quote = "We run coaching programs.";
  const username = `e2e-${id}-reapply`;
  const lead = await seed.createLead({
    skoolUsername: username,
    name: `reapply ${id}`,
    bio: `Founder. ${quote}`,
  });
  await seed.scriptLeadAssessment(username, scriptFor("qualified", quote));
  await seed.attachCampaignLeads({
    campaignId: campaign.campaignId,
    leads: [{ leadId: lead.leadId, stage: 1, status: "done" }],
  });

  try {
    await page.goto(`/admin/campaigns/${campaign.campaignId}?stage=2`);
    await page.getByRole("button", { name: "Run AI filter" }).click();
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: `reapply ${id}` })
        .getByRole("button", { name: "Qualified" }),
    ).toBeVisible({ timeout: 20_000 });

    // The script is removed, so only the stored answers can produce the next verdict
    await seed.unscriptLeadAssessment(username);

    await open(page, campaign.campaignId);
    await choose(page, field(page, "role", 0), /^Disqualifier/);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("AI filter saved.")).toBeVisible();

    await page.goto(`/admin/campaigns/${campaign.campaignId}?stage=2`);
    await page.getByRole("button", { name: "Re-apply rules" }).click();

    await expect(
      page
        .getByRole("row")
        .filter({ hasText: `reapply ${id}` })
        .getByRole("button", { name: "Disqualified" }),
    ).toBeVisible();
    const [assessment] = await seed.listLeadAssessments(campaign.campaignId);
    expect(assessment?.verdict).toBe("disqualified");
    const [stored] = await seed.listCampaignLeads(campaign.campaignId);
    expect([stored?.stage, stored?.status, stored?.failureReason]).toEqual([
      2,
      "failed",
      "Disqualified",
    ]);
  } finally {
    await seed.unscriptLeadAssessment(username);
  }
});

test("choosing the Signal role saves it, and the assessment shows how many signals were yes as a priority without changing the verdict", async ({
  page,
  seed,
}) => {
  const { campaign, id } = await setupAdmin(page, seed, { status: "active" });
  await open(page, campaign.campaignId);
  await page.getByRole("button", { name: "Use the starter questions" }).click();
  await choose(page, field(page, "role", 0), /^Signal/);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("AI filter saved.")).toBeVisible();

  await expect
    .poll(async () =>
      (await seed.listFilterQuestions(campaign.campaignId)).map((q) => q.role),
    )
    .toEqual(
      defaultFilterQuestions.map((q, index) =>
        index === 0 ? "signal" : q.role,
      ),
    );

  const quote = "We run coaching programs.";
  const username = `e2e-${id}-signal`;
  const lead = await seed.createLead({
    skoolUsername: username,
    name: `signal ${id}`,
    bio: `Founder. ${quote}`,
  });
  const signalLabels = new Set([
    labels[0],
    ...defaultFilterQuestions
      .filter((q) => q.role === "signal")
      .map((q) => q.label),
  ]);
  // Of the three signal questions the first is a no and the other two are yes
  const script = scriptFor("qualified", quote);
  script.answers[labels[0] ?? ""] = { answer: "no" };
  await seed.scriptLeadAssessment(username, script);
  await seed.attachCampaignLeads({
    campaignId: campaign.campaignId,
    leads: [{ leadId: lead.leadId, stage: 1, status: "done" }],
  });

  try {
    await page.goto(`/admin/campaigns/${campaign.campaignId}?stage=2`);
    await page.getByRole("button", { name: "Run AI filter" }).click();
    const row = page.getByRole("row").filter({ hasText: `signal ${id}` });
    await expect(row.getByRole("button", { name: "Qualified" })).toBeVisible({
      timeout: 20_000,
    });

    await row.getByRole("button", { name: "Qualified" }).click();
    await expect(page.locator('[data-slot="sheet-content"]')).toContainText(
      `Priority 2/${signalLabels.size}`,
    );
    const [assessment] = await seed.listLeadAssessments(campaign.campaignId);
    expect(assessment?.verdict).toBe("qualified");
    const [stored] = await seed.listCampaignLeads(campaign.campaignId);
    expect([stored?.status, stored?.failureReason]).toEqual(["done", null]);
  } finally {
    await seed.unscriptLeadAssessment(username);
  }
});

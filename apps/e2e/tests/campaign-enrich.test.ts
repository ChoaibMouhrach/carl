import { test, expect } from "../fixtures";
import { token } from "./support";

const linkedin = (slug: string) => `https://www.linkedin.com/in/${slug}`;

test("running the web search saves a LinkedIn profile or else a website on each qualified lead and leaves the rest as they were", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const campaign = await seed.createCampaign({
    name: `Enrich ${id}`,
    status: "active",
  });
  const entries = [
    { key: "linkedin", name: `Alpha ${id}` },
    { key: "website", name: `Bravo ${id}` },
    { key: "nothing", name: `Charlie ${id}` },
    { key: "known", name: `Delta ${id}` },
  ] as const;
  const leads = [];
  for (const entry of entries) {
    const lead = await seed.createLead({
      skoolUsername: `e2e-${id}-${entry.key}`,
      name: entry.name,
      website: entry.key === "known" ? "https://delta-known.example.com" : null,
    });
    leads.push(lead);
  }
  await seed.attachCampaignLeads({
    campaignId: campaign.campaignId,
    leads: leads.map((lead) => ({
      leadId: lead.leadId,
      stage: 2,
      status: "done",
    })),
  });
  const queries = {
    linkedinFor: (name: string) => `${name} LinkedIn`,
    websiteFor: (name: string) => `${name} official website`,
  };
  const scripted: string[] = [];
  const script = async (
    query: string,
    name: string,
    results: { url: string }[],
  ) => {
    scripted.push(query);
    await seed.scriptWebSearch(query, {
      results: results.map((result) => ({
        ...result,
        title: name,
        content: name,
      })),
    });
  };

  try {
    await script(queries.linkedinFor(`Alpha ${id}`), `Alpha ${id}`, [
      { url: `${linkedin(`alpha-${id}`)}/?trk=x` },
    ]);
    await script(queries.linkedinFor(`Bravo ${id}`), `Bravo ${id}`, [
      { url: "https://www.linkedin.com/company/bravo" },
    ]);
    await script(queries.websiteFor(`Bravo ${id}`), `Bravo ${id}`, [
      { url: "https://www.facebook.com/bravo" },
      { url: `https://bravo-${id}.example.com/` },
    ]);

    await page.goto(`/admin/campaigns/${campaign.campaignId}?stage=3`);
    await page.getByRole("button", { name: "Run web search" }).click();

    const row = (name: string) =>
      page.getByRole("row").filter({ hasText: name });
    await expect(
      row(`Alpha ${id}`).getByRole("link", { name: /linkedin\.com/ }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      row(`Bravo ${id}`).getByRole("link", { name: /bravo-/ }),
    ).toBeVisible();

    const stored = await seed.listCampaignLeads(campaign.campaignId);
    expect(
      Object.fromEntries(
        stored.map((lead) => [
          lead.skoolUsername.replace(`e2e-${id}-`, ""),
          [lead.stage, lead.status, lead.failureReason],
        ]),
      ),
    ).toEqual({
      linkedin: [3, "done", null],
      website: [3, "done", null],
      nothing: [3, "failed", "Nothing found"],
      known: [3, "done", null],
    });
    const rows = await seed.listLeadsByUsernamePrefix(`e2e-${id}-`);
    expect(
      Object.fromEntries(
        rows.map((lead) => [
          lead.skoolUsername.replace(`e2e-${id}-`, ""),
          [lead.linkedinUrl, lead.website],
        ]),
      ),
    ).toEqual({
      linkedin: [linkedin(`alpha-${id}`), null],
      website: [null, `https://bravo-${id}.example.com/`],
      nothing: [null, null],
      known: [null, "https://delta-known.example.com"],
    });
  } finally {
    for (const query of scripted) await seed.unscriptWebSearch(query);
  }
});

test("a profile or site about someone else is never saved, while a matching one for another lead is", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const campaign = await seed.createCampaign({
    name: `Wrong person ${id}`,
    status: "active",
  });
  const entries = [
    { key: "mismatch", name: `Echo ${id}` },
    { key: "match", name: `Foxtrot ${id}` },
  ] as const;
  const leads = [];
  for (const entry of entries) {
    leads.push(
      await seed.createLead({
        skoolUsername: `e2e-${id}-${entry.key}`,
        name: entry.name,
      }),
    );
  }
  await seed.attachCampaignLeads({
    campaignId: campaign.campaignId,
    leads: leads.map((lead) => ({
      leadId: lead.leadId,
      stage: 2,
      status: "done",
    })),
  });
  const scripted = [
    `Echo ${id} LinkedIn`,
    `Echo ${id} official website`,
    `Foxtrot ${id} LinkedIn`,
  ];

  try {
    await seed.scriptWebSearch(scripted[0] ?? "", {
      results: [
        {
          url: "https://www.linkedin.com/in/mark-wilson",
          title: "Mark Wilson - Dentist",
          content: "A dentist in Leeds",
        },
      ],
    });
    await seed.scriptWebSearch(scripted[1] ?? "", {
      results: [
        {
          url: `https://dentist-${id}.example.com/`,
          title: "Leeds Dental",
          content: "Family dentistry",
        },
      ],
    });
    await seed.scriptWebSearch(scripted[2] ?? "", {
      results: [
        {
          url: linkedin(`foxtrot-${id}`),
          title: `Foxtrot ${id} - Coach`,
          content: "",
        },
      ],
    });

    await page.goto(`/admin/campaigns/${campaign.campaignId}?stage=3`);
    await page.getByRole("button", { name: "Run web search" }).click();

    const row = (name: string) =>
      page.getByRole("row").filter({ hasText: name });
    await expect(
      row(`Foxtrot ${id}`).getByRole("link", { name: /linkedin\.com/ }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(row(`Echo ${id}`).getByRole("link")).toHaveCount(0);

    const stored = await seed.listCampaignLeads(campaign.campaignId);
    expect(
      Object.fromEntries(
        stored.map((lead) => [
          lead.skoolUsername.replace(`e2e-${id}-`, ""),
          [lead.stage, lead.status, lead.failureReason],
        ]),
      ),
    ).toEqual({
      mismatch: [3, "failed", "Nothing found"],
      match: [3, "done", null],
    });
    const rows = await seed.listLeadsByUsernamePrefix(`e2e-${id}-`);
    expect(
      Object.fromEntries(
        rows.map((lead) => [
          lead.skoolUsername.replace(`e2e-${id}-`, ""),
          [lead.linkedinUrl, lead.website],
        ]),
      ),
    ).toEqual({
      mismatch: [null, null],
      match: [linkedin(`foxtrot-${id}`), null],
    });
  } finally {
    for (const query of scripted) await seed.unscriptWebSearch(query);
  }
});

test("the web search cannot be run on a campaign that is not active", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const campaign = await seed.createCampaign({
    name: `Draft enrich ${token()}`,
    status: "draft",
  });

  await page.goto(`/admin/campaigns/${campaign.campaignId}?stage=3`);

  await expect(
    page.getByRole("button", { name: "Run web search" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Activate the campaign to run its stages."),
  ).toBeVisible();
});

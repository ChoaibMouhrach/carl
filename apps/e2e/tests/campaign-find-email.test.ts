import { test, expect } from "../fixtures";
import { token } from "./support";

const linkedin = (slug: string) => `https://www.linkedin.com/in/${slug}`;

test("finding emails saves a lowercase work email on each lead that has one, says why the others failed, and leaves leads that failed stage 3 alone", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const short = id.slice(0, 6);
  const campaign = await seed.createCampaign({
    name: `Find email ${id}`,
    status: "active",
  });
  const domain = `site-${id}.example.com`;
  const entries: {
    key: string;
    name: string;
    linkedinUrl?: string;
    website?: string;
    emails?: string[];
  }[] = [
    {
      key: "linkedin",
      name: `Alpha Found${short}`,
      linkedinUrl: linkedin(`alpha-${id}`),
    },
    {
      key: "site",
      name: `Bravo Site${short}`,
      website: `https://www.${domain}/about`,
    },
    {
      key: "missing",
      name: `Charlie Missing${short}`,
      linkedinUrl: linkedin(`charlie-${id}`),
    },
    {
      key: "noname",
      name: "Madonna",
      website: `https://noname-${id}.example.com`,
    },
    {
      key: "known",
      name: `Delta Known${short}`,
      linkedinUrl: linkedin(`delta-${id}`),
      emails: [`bio-${id}@example.com`],
    },
  ];
  const leads = [];
  for (const entry of entries) {
    const { key, ...fields } = entry;
    leads.push(
      await seed.createLead({
        skoolUsername: `e2e-${id}-${key}`,
        ...fields,
      }),
    );
  }
  const skipped = await seed.createLead({
    skoolUsername: `e2e-${id}-skipped`,
    name: `Echo Skipped${short}`,
  });
  await seed.attachCampaignLeads({
    campaignId: campaign.campaignId,
    leads: [
      ...leads.map((lead) => ({
        leadId: lead.leadId,
        stage: 3 as const,
        status: "done" as const,
      })),
      {
        leadId: skipped.leadId,
        stage: 3,
        status: "failed",
        failureReason: "Nothing found",
      },
    ],
  });
  const scripted = [
    linkedin(`alpha-${id}`),
    `Bravo Site${short} ${domain}`,
    linkedin(`charlie-${id}`),
  ];

  try {
    await seed.scriptEmailFinder(scripted[0] ?? "", {
      email: `Alpha-${id}@Example.COM`,
    });
    await seed.scriptEmailFinder(scripted[1] ?? "", {
      email: `bravo-${id}@example.com`,
    });

    await page.goto(`/admin/campaigns/${campaign.campaignId}?stage=4`);
    await page.getByRole("button", { name: "Find emails" }).click();

    const row = (name: string) =>
      page.getByRole("row").filter({ hasText: name });
    await expect(
      row(`Alpha Found${short}`).getByRole("link", {
        name: `alpha-${id}@example.com`,
      }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      row(`Bravo Site${short}`).getByRole("link", {
        name: `bravo-${id}@example.com`,
      }),
    ).toBeVisible();
    await expect(
      row(`Charlie Missing${short}`).getByText("No email found"),
    ).toBeVisible();
    await expect(row("Madonna").getByText("No usable name")).toBeVisible();
    await expect(
      row(`Delta Known${short}`).getByRole("link", {
        name: `bio-${id}@example.com`,
      }),
    ).toBeVisible();
    await expect(row(`Echo Skipped${short}`)).toHaveCount(0);

    await page.goto(`/admin/campaigns/${campaign.campaignId}?stage=3`);
    await expect(
      row(`Echo Skipped${short}`).getByText("Nothing found"),
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
      linkedin: [4, "done", null],
      site: [4, "done", null],
      missing: [4, "failed", "No email found"],
      noname: [4, "failed", "No usable name"],
      known: [4, "done", null],
      skipped: [3, "failed", "Nothing found"],
    });
    const rows = await seed.listLeadsByUsernamePrefix(`e2e-${id}-`);
    expect(
      Object.fromEntries(
        rows.map((lead) => [
          lead.skoolUsername.replace(`e2e-${id}-`, ""),
          lead.emails,
        ]),
      ),
    ).toEqual({
      linkedin: [`alpha-${id}@example.com`],
      site: [`bravo-${id}@example.com`],
      missing: [],
      noname: [],
      known: [`bio-${id}@example.com`],
      skipped: [],
    });
  } finally {
    for (const identity of scripted) await seed.unscriptEmailFinder(identity);
  }
});

test("finding emails cannot be run on a campaign that is not active", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const campaign = await seed.createCampaign({
    name: `Draft find email ${token()}`,
    status: "draft",
  });

  await page.goto(`/admin/campaigns/${campaign.campaignId}?stage=4`);

  await expect(
    page.getByRole("button", { name: "Find emails" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Activate the campaign to run its stages."),
  ).toBeVisible();
});

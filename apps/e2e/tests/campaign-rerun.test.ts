import { test, expect } from "../fixtures";
import { token } from "./support";

const linkedin = (slug: string) => `https://www.linkedin.com/in/${slug}`;

test("re-running the email search for a selected lead opens on the current stage, adds the new email to the old one, leaves other leads alone and clears the selection", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const short = id.slice(0, 6);
  const campaign = await seed.createCampaign({
    name: `Rerun email ${id}`,
    status: "active",
  });
  const chosen = await seed.createLead({
    skoolUsername: `e2e-${id}-chosen`,
    name: `Alpha Chosen${short}`,
    linkedinUrl: linkedin(`chosen-${id}`),
    emails: [`old-${id}@example.com`],
  });
  const other = await seed.createLead({
    skoolUsername: `e2e-${id}-other`,
    name: `Bravo Other${short}`,
    linkedinUrl: linkedin(`other-${id}`),
    emails: [`keep-${id}@example.com`],
  });
  await seed.attachCampaignLeads({
    campaignId: campaign.campaignId,
    leads: [chosen, other].map((lead) => ({
      leadId: lead.leadId,
      stage: 4,
      status: "done",
    })),
  });
  const identity = linkedin(`chosen-${id}`);

  try {
    await seed.scriptEmailFinder(identity, { email: `New-${id}@Example.COM` });
    await page.goto(`/admin/campaigns/${campaign.campaignId}?stage=4`);
    const row = (name: string) =>
      page.getByRole("row").filter({ hasText: name });
    await expect(row(`Alpha Chosen${short}`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Re-run" })).toHaveCount(0);

    await row(`Alpha Chosen${short}`).getByRole("checkbox").click();
    await expect(page.getByText("1 selected")).toBeVisible();
    await page.getByRole("button", { name: "Re-run" }).click();

    await expect(page.getByText("Re-run a stage for 1 lead?")).toBeVisible();
    await expect(
      page.getByRole("radio", { name: /Email search/ }),
    ).toBeChecked();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Re-run" })
      .click();

    await expect
      .poll(async () =>
        (await seed.listLeadsByUsernamePrefix(`e2e-${id}-`)).map(
          (lead) => lead.emails,
        ),
      )
      .toEqual([
        [`old-${id}@example.com`, `new-${id}@example.com`],
        [`keep-${id}@example.com`],
      ]);
    await expect(page.getByText("1 selected")).toHaveCount(0);

    const stored = await seed.listCampaignLeads(campaign.campaignId);
    expect(
      Object.fromEntries(
        stored.map((lead) => [
          lead.skoolUsername.replace(`e2e-${id}-`, ""),
          [lead.stage, lead.status, lead.failureReason],
        ]),
      ),
    ).toEqual({
      chosen: [4, "done", null],
      other: [4, "done", null],
    });
  } finally {
    await seed.unscriptEmailFinder(identity);
  }
});

test("choosing the web search in the dialog moves the lead back to stage 3, replaces its LinkedIn profile and takes it off the stage 4 list", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const short = id.slice(0, 6);
  const name = `Alpha Search${short}`;
  const campaign = await seed.createCampaign({
    name: `Rerun search ${id}`,
    status: "active",
  });
  const lead = await seed.createLead({
    skoolUsername: `e2e-${id}-search`,
    name,
    linkedinUrl: linkedin(`old-${id}`),
  });
  await seed.attachCampaignLeads({
    campaignId: campaign.campaignId,
    leads: [{ leadId: lead.leadId, stage: 4, status: "done" }],
  });
  const query = `${name} LinkedIn`;

  try {
    await seed.scriptWebSearch(query, {
      results: [{ url: linkedin(`new-${id}`), title: name, content: name }],
    });
    await page.goto(`/admin/campaigns/${campaign.campaignId}?stage=4`);
    const row = page.getByRole("row").filter({ hasText: name });
    await row.getByRole("checkbox").click();
    await page.getByRole("button", { name: "Re-run" }).click();
    await page.getByRole("radio", { name: /Web search/ }).click();
    await expect(page.getByRole("radio", { name: /Web search/ })).toBeChecked();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Re-run" })
      .click();

    await expect
      .poll(async () => {
        const stored = await seed.listCampaignLeads(campaign.campaignId);

        return stored.map((item) => [item.stage, item.status]);
      })
      .toEqual([[3, "done"]]);
    const [saved] = await seed.listLeadsByUsernamePrefix(`e2e-${id}-`);
    expect(saved?.linkedinUrl).toBe(linkedin(`new-${id}`));
    await expect(row).toHaveCount(0);

    await page.goto(`/admin/campaigns/${campaign.campaignId}?stage=3`);
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: name })
        .getByRole("link", { name: /linkedin\.com\/in\/new-/ }),
    ).toBeVisible();
  } finally {
    await seed.unscriptWebSearch(query);
  }
});

test("cancelling the dialog changes nothing and keeps the selection, and a selected lead that has not reached the stage is left out while the others run", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const short = id.slice(0, 6);
  const campaign = await seed.createCampaign({
    name: `Rerun left out ${id}`,
    status: "active",
  });
  const ready = await seed.createLead({
    skoolUsername: `e2e-${id}-ready`,
    name: `Alpha Ready${short}`,
    linkedinUrl: linkedin(`ready-${id}`),
  });
  const early = await seed.createLead({
    skoolUsername: `e2e-${id}-early`,
    name: `Bravo Early${short}`,
    linkedinUrl: linkedin(`early-${id}`),
  });
  await seed.attachCampaignLeads({
    campaignId: campaign.campaignId,
    leads: [
      { leadId: ready.leadId, stage: 4, status: "done" },
      { leadId: early.leadId, stage: 1, status: "done" },
    ],
  });
  const identity = linkedin(`ready-${id}`);

  try {
    await seed.scriptEmailFinder(identity, {
      email: `ready-${id}@example.com`,
    });
    await page.goto(`/admin/campaigns/${campaign.campaignId}`);
    const row = (name: string) =>
      page.getByRole("row").filter({ hasText: name });
    await row(`Alpha Ready${short}`).getByRole("checkbox").click();
    await row(`Bravo Early${short}`).getByRole("checkbox").click();
    await expect(page.getByText("2 selected")).toBeVisible();

    await page.getByRole("button", { name: "Re-run" }).click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);

    await expect(page.getByText("2 selected")).toBeVisible();
    expect(
      (await seed.listLeadsByUsernamePrefix(`e2e-${id}-`)).map(
        (lead) => lead.emails,
      ),
    ).toEqual([[], []]);

    await page.getByRole("button", { name: "Re-run" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Re-run" })
      .click();

    await expect
      .poll(async () =>
        (await seed.listLeadsByUsernamePrefix(`e2e-${id}-`)).map(
          (lead) => lead.emails,
        ),
      )
      .toEqual([[`ready-${id}@example.com`], []]);
    const stored = await seed.listCampaignLeads(campaign.campaignId);
    expect(
      Object.fromEntries(
        stored.map((lead) => [
          lead.skoolUsername.replace(`e2e-${id}-`, ""),
          [lead.stage, lead.status],
        ]),
      ),
    ).toEqual({ ready: [4, "done"], early: [1, "done"] });
  } finally {
    await seed.unscriptEmailFinder(identity);
  }
});

test("re-running is disabled on a campaign that is not active", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const campaign = await seed.createCampaign({
    name: `Draft rerun ${id}`,
    status: "draft",
  });
  const lead = await seed.createLead({
    skoolUsername: `e2e-${id}-draft`,
    name: `Alpha Draft${id.slice(0, 6)}`,
    linkedinUrl: linkedin(`draft-${id}`),
  });
  await seed.attachCampaignLeads({
    campaignId: campaign.campaignId,
    leads: [{ leadId: lead.leadId, stage: 4, status: "done" }],
  });

  await page.goto(`/admin/campaigns/${campaign.campaignId}?stage=4`);
  await page
    .getByRole("row")
    .filter({ hasText: `Alpha Draft${id.slice(0, 6)}` })
    .getByRole("checkbox")
    .click();

  await expect(page.getByRole("button", { name: "Re-run" })).toBeDisabled();
  expect((await seed.listCampaignLeads(campaign.campaignId))[0]).toMatchObject({
    stage: 4,
    status: "done",
  });
});

test("finding emails for the done scope sends no lead ids and writes emails only for the done leads, not for failed, waiting or earlier-stage leads or another campaign", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const campaign = await seed.createCampaign({
    name: `Scope ${id}`,
    status: "active",
  });
  const otherCampaign = await seed.createCampaign({
    name: `Scope other ${id}`,
    status: "active",
  });
  const groups = [
    { key: "done-a", stage: 4, status: "done", emails: [`a-${id}@old.com`] },
    { key: "done-b", stage: 4, status: "done", emails: [] },
    {
      key: "failed",
      stage: 4,
      status: "failed",
      failureReason: "No email found",
      emails: [],
    },
    { key: "waiting", stage: 4, status: "pending", emails: [] },
    { key: "early", stage: 3, status: "done", emails: [] },
    { key: "stranger", stage: 4, status: "done", emails: [], other: true },
  ] as const;
  const leads = await Promise.all(
    groups.map((group) =>
      seed.createLead({
        skoolUsername: `e2e-${id}-${group.key}`,
        name: `Lead ${group.key} ${id.slice(0, 6)}`,
        linkedinUrl: linkedin(`${group.key}-${id}`),
        emails: [...group.emails],
      }),
    ),
  );
  for (const [index, group] of groups.entries()) {
    await seed.attachCampaignLeads({
      campaignId: (group.key === "stranger" ? otherCampaign : campaign)
        .campaignId,
      leads: [
        {
          leadId: leads[index]?.leadId ?? 0,
          stage: group.stage,
          status: group.status,
          ...("failureReason" in group
            ? { failureReason: group.failureReason }
            : {}),
        },
      ],
    });
  }
  const identities = groups.map((group) => linkedin(`${group.key}-${id}`));

  try {
    for (const [index, group] of groups.entries()) {
      await seed.scriptEmailFinder(identities[index] ?? "", {
        email: `found-${group.key}-${id}@example.com`,
      });
    }
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().endsWith("/rerun")) {
        requests.push(request.postData() ?? "");
      }
    });
    await page.goto(`/admin/campaigns/${campaign.campaignId}?stage=4`);
    await page
      .getByRole("combobox")
      .filter({ hasText: "Waiting leads" })
      .click();
    await page.getByRole("option", { name: "Done leads", exact: true }).click();
    await page.getByRole("button", { name: "Find emails" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Find emails" })
      .click();

    const emailsByKey = async () =>
      Object.fromEntries(
        (await seed.listLeadsByUsernamePrefix(`e2e-${id}-`)).map((lead) => [
          lead.skoolUsername.replace(`e2e-${id}-`, ""),
          lead.emails,
        ]),
      );

    await expect
      .poll(async () => (await emailsByKey())["done-b"])
      .toEqual([`found-done-b-${id}@example.com`]);
    expect(await emailsByKey()).toEqual({
      "done-a": [`a-${id}@old.com`, `found-done-a-${id}@example.com`],
      "done-b": [`found-done-b-${id}@example.com`],
      failed: [],
      waiting: [],
      early: [],
      stranger: [],
    });
    expect(requests).toHaveLength(1);
    expect(JSON.parse(requests[0] ?? "{}")).toEqual({
      stage: 4,
      scope: "done",
    });
    const stored = await seed.listCampaignLeads(campaign.campaignId);
    expect(
      Object.fromEntries(
        stored.map((lead) => [
          lead.skoolUsername.replace(`e2e-${id}-`, ""),
          [lead.stage, lead.status, lead.failureReason],
        ]),
      ),
    ).toEqual({
      "done-a": [4, "done", null],
      "done-b": [4, "done", null],
      failed: [4, "failed", "No email found"],
      waiting: [4, "pending", null],
      early: [3, "done", null],
    });
    const otherStored = await seed.listCampaignLeads(otherCampaign.campaignId);
    expect(
      otherStored.map((lead) => [lead.stage, lead.status, lead.failureReason]),
    ).toEqual([[4, "done", null]]);
  } finally {
    await Promise.all(identities.map((url) => seed.unscriptEmailFinder(url)));
  }
});

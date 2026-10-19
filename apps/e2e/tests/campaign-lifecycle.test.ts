import { test, expect } from "../fixtures";
import type { Page } from "@playwright/test";
import { seedConfig } from "../config";
import { club, confirmDelete, rowActions, token } from "./support";

const config = seedConfig();

const status = (page: Page, name: string) =>
  page
    .locator('[data-slot="badge"]')
    .filter({ hasText: new RegExp(`^${name}$`) });

const toggle = (page: Page, name: "Activate" | "Pause" | "Resume") =>
  page.getByRole("button", { name, exact: true });

test("a campaign goes from draft to active, scrapes, pauses, resumes and scrapes again without losing its leads", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const keyword = `kw ${id}`;
  const script = {
    keyword,
    searches: { "public-paid": [club(id, { suffix: "a", price: 2900 })] },
  };
  await seed.scriptSkool(script);
  const campaign = await seed.createCampaign({
    name: `Journey ${id}`,
    keywords: [keyword],
  });

  try {
    await page.goto(`/admin/campaigns/${campaign.campaignId}?stage=1`);
    await expect(status(page, "Draft")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Run scrape$/ }),
    ).toBeDisabled();

    await toggle(page, "Activate").click();
    await expect(status(page, "Active")).toBeVisible();
    await expect
      .poll(() => seed.findCampaignByName(`Journey ${id}`))
      .toMatchObject({ status: "active" });

    await page.getByRole("button", { name: /Run scrape$/ }).click();
    await expect(status(page, "Completed")).toBeVisible();
    expect(await seed.listCampaignLeads(campaign.campaignId)).toEqual([
      expect.objectContaining({
        skoolUsername: `e2e-${id}-a`,
        stage: 1,
        status: "done",
      }),
    ]);

    await toggle(page, "Pause").click();
    await expect(toggle(page, "Resume")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Run scrape$/ }),
    ).toBeDisabled();
    await expect
      .poll(() => seed.findCampaignByName(`Journey ${id}`))
      .toMatchObject({ status: "paused" });
    // Pausing leaves the collected leads and the finished run alone
    expect(await seed.listCampaignLeads(campaign.campaignId)).toHaveLength(1);
    expect(await seed.listScrapeRuns(campaign.campaignId)).toHaveLength(1);

    await toggle(page, "Resume").click();
    await expect(toggle(page, "Pause")).toBeVisible();
    await page.getByRole("button", { name: /Run scrape$/ }).click();
    await expect
      .poll(async () => (await seed.listScrapeRuns(campaign.campaignId)).length)
      .toBe(2);
    await expect
      .poll(
        async () => (await seed.listScrapeRuns(campaign.campaignId))[0]?.status,
      )
      .toBe("completed");

    const leads = await seed.listCampaignLeads(campaign.campaignId);
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ stage: 1, status: "done" });
  } finally {
    await seed.unscriptSkool(script);
  }
});

test("a completed campaign has no toggle and refuses a scrape", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const campaign = await seed.createCampaign({
    name: `Done ${id}`,
    status: "completed",
  });

  await page.goto(`/admin/campaigns/${campaign.campaignId}?stage=1`);
  await expect(status(page, "Completed")).toBeVisible();
  for (const name of ["Activate", "Pause", "Resume"] as const) {
    await expect(toggle(page, name)).toHaveCount(0);
  }
  await expect(
    page.getByRole("button", { name: /Run scrape$/ }),
  ).toBeDisabled();

  const response = await page
    .context()
    .request.post(
      `${config.apiUrl}/api/campaigns/${campaign.campaignId}/scrape`,
      { headers: { Origin: config.webOrigin } },
    );
  expect(response.status()).toBe(400);
  expect(await seed.listScrapeRuns(campaign.campaignId)).toEqual([]);
});

test("transitions the page never offers are refused by the server and leave the status alone", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const finished = await seed.createCampaign({
    name: `Finished ${id}`,
    status: "completed",
  });
  const draft = await seed.createCampaign({ name: `Draft ${id}` });
  const headers = { Origin: config.webOrigin };

  const reopen = await page
    .context()
    .request.patch(`${config.apiUrl}/api/campaigns/${finished.campaignId}`, {
      data: { status: "active" },
      headers,
    });
  const skipActivation = await page
    .context()
    .request.patch(`${config.apiUrl}/api/campaigns/${draft.campaignId}`, {
      data: { status: "paused" },
      headers,
    });

  expect(reopen.status()).toBe(400);
  expect(skipActivation.status()).toBe(400);
  expect(await seed.findCampaignByName(`Finished ${id}`)).toMatchObject({
    status: "completed",
  });
  expect(await seed.findCampaignByName(`Draft ${id}`)).toMatchObject({
    status: "draft",
  });
});

test("deleting one campaign keeps a lead that another campaign also holds", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const shared = await seed.createLead({
    skoolUsername: `e2e-shared-${id}`,
    name: `Shared ${id}`,
  });
  const only = await seed.createLead({
    skoolUsername: `e2e-only-${id}`,
    name: `Only ${id}`,
  });
  const doomed = await seed.createCampaign({ name: `Doomed ${id}` });
  const survivor = await seed.createCampaign({ name: `Survivor ${id}` });
  await seed.attachCampaignLeads({
    campaignId: doomed.campaignId,
    leads: [
      { leadId: shared.leadId, stage: 1, status: "done" },
      { leadId: only.leadId, stage: 2, status: "done" },
    ],
  });
  await seed.attachCampaignLeads({
    campaignId: survivor.campaignId,
    leads: [{ leadId: shared.leadId, stage: 3, status: "pending" }],
  });

  await page.goto(`/admin/campaigns?search=${id}`);
  await rowActions(page, `Doomed ${id}`).click();
  await confirmDelete(page);

  await expect.poll(() => seed.findCampaignByName(`Doomed ${id}`)).toBeNull();
  expect(await seed.listCampaignLeads(doomed.campaignId)).toEqual([]);
  expect(await seed.listCampaignLeads(survivor.campaignId)).toEqual([
    expect.objectContaining({
      leadId: shared.leadId,
      stage: 3,
      status: "pending",
    }),
  ]);
  expect(await seed.findLeadByUsername(`e2e-shared-${id}`)).not.toBeNull();
  expect(await seed.findLeadByUsername(`e2e-only-${id}`)).not.toBeNull();
});

test("a campaign's lead count equals its attached leads and survives paging past twelve", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const campaign = await seed.createCampaign({ name: `Big ${id}` });
  const leads = await Promise.all(
    Array.from({ length: 15 }, (_, index) =>
      seed.createLead({
        skoolUsername: `e2e-big-${id}-${String(index).padStart(2, "0")}`,
        name: `Big ${id} ${String(index).padStart(2, "0")}`,
      }),
    ),
  );
  await seed.attachCampaignLeads({
    campaignId: campaign.campaignId,
    leads: leads.map((lead, index) => ({
      leadId: lead.leadId,
      stage: index < 10 ? 1 : 2,
      status: "done",
    })),
  });

  await page.goto(`/admin/campaigns/${campaign.campaignId}?stage=1`);
  await expect(
    page.getByText("15 leads", { exact: false }).first(),
  ).toBeVisible();

  const stored = await seed.listCampaignLeads(campaign.campaignId);
  expect(stored).toHaveLength(15);
  expect(stored.filter((lead) => lead.stage === 1)).toHaveLength(10);
  expect(stored.filter((lead) => lead.stage === 2)).toHaveLength(5);

  await page.goto(`/admin/campaigns?search=${id}`);
  await expect(
    page.getByRole("row").filter({ hasText: `Big ${id}` }),
  ).toContainText("15");
});

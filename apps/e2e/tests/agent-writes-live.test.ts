import { test, expect } from "../fixtures";
import type { Browser, Page } from "@playwright/test";
import { callTool, connectViaApi, field } from "./mcp-support";
import { club, confirmDelete, rowActions, token } from "./support";

const LIVE = { timeout: 10_000 };

/** An admin's browser that watches, and a signed-in context that carries the agent's calls */
const setupWatcher = async (
  browser: Browser,
  seed: Parameters<Parameters<typeof test>[2]>[0]["seed"],
) => {
  const admin = await seed.createVerifiedAdmin();
  const watcher = await browser.newContext();
  const actor = await browser.newContext();
  await seed.authenticate(watcher, admin.email);
  await seed.authenticate(actor, admin.email);
  const { accessToken } = await connectViaApi(
    actor.request,
    `Agent ${token()}`,
  );
  const agent = (name: string, args: object) =>
    callTool(actor.request, accessToken, name, args);

  return {
    admin,
    watcher,
    agent,
    close: async () => {
      await watcher.close();
      await actor.close();
    },
  };
};

const row = (page: Page, text: string) =>
  page.getByRole("row").filter({ hasText: text });

test("a lead an agent creates appears on an open Leads list without a reload", async ({
  browser,
  seed,
}) => {
  const { watcher, agent, close } = await setupWatcher(browser, seed);
  const id = token();
  const page = await watcher.newPage();
  await page.goto(`/admin/leads?search=${id}`);
  await expect(page.getByText("No leads found.")).toBeVisible();

  const created = await agent("create_lead", {
    skoolUsername: `e2e-${id}`,
    name: `Agent lead ${id}`,
    website: "https://agent.example.com",
  });

  expect(created.isError).toBe(false);
  await expect(row(page, `Agent lead ${id}`)).toHaveCount(1, LIVE);
  expect(await seed.findLeadByUsername(`e2e-${id}`)).toMatchObject({
    name: `Agent lead ${id}`,
    website: "https://agent.example.com",
  });
  await close();
});

test("a campaign an agent creates shows as a draft, and an admin can activate it and run it", async ({
  browser,
  seed,
}) => {
  const { watcher, agent, close } = await setupWatcher(browser, seed);
  const id = token();
  const keyword = `agent kw ${id}`;
  const script = {
    keyword,
    searches: { "public-paid": [club(id, { suffix: "a", price: 1000 })] },
  };
  await seed.scriptSkool(script);
  const list = await watcher.newPage();
  await list.goto(`/admin/campaigns?search=${id}`);

  try {
    const created = await agent("create_campaign", {
      name: `Agent campaign ${id}`,
      keywords: [keyword],
      types: ["public"],
      pricingModels: ["paid"],
    });

    expect(created.isError).toBe(false);
    await expect(row(list, `Agent campaign ${id}`)).toContainText(
      "Draft",
      LIVE,
    );
    const campaignId = Number(field(created.value, "campaignId"));
    expect(await seed.findCampaignByName(`Agent campaign ${id}`)).toMatchObject(
      {
        campaignId,
        status: "draft",
      },
    );

    const detail = await watcher.newPage();
    await detail.goto(`/admin/campaigns/${campaignId}?stage=1`);
    await detail.getByRole("button", { name: "Activate", exact: true }).click();
    await expect(
      detail.locator('[data-slot="badge"]').filter({ hasText: /^Active$/ }),
    ).toBeVisible();
    await detail.getByRole("button", { name: /Run scrape$/ }).click();
    await expect(
      detail.locator('[data-slot="badge"]').filter({ hasText: /^Completed$/ }),
    ).toBeVisible();

    expect(await seed.listCampaignLeads(campaignId)).toEqual([
      expect.objectContaining({
        skoolUsername: `e2e-${id}-a`,
        stage: 1,
        status: "done",
      }),
    ]);
  } finally {
    await seed.unscriptSkool(script);
    await close();
  }
});

test("a community an agent saves appears on the Communities list and raises its lead's count", async ({
  browser,
  seed,
}) => {
  const { watcher, agent, close } = await setupWatcher(browser, seed);
  const id = token();
  const lead = await seed.createLead({
    skoolUsername: `e2e-${id}`,
    name: `Owner ${id}`,
  });
  const communities = await watcher.newPage();
  const leads = await watcher.newPage();
  await communities.goto(`/admin/communities?search=${id}`);
  await leads.goto(`/admin/leads?search=${id}`);
  await expect(
    row(leads, `Owner ${id}`).getByRole("cell", { name: "0", exact: true }),
  ).toBeVisible();

  const created = await agent("create_community", {
    skoolId: `skool-${id}`,
    leadId: lead.leadId,
    name: `club-${id}`,
    displayName: `Club ${id}`,
    communityUrl: `https://www.skool.com/club-${id}`,
    memberCount: 250,
    prices: [
      { type: "paid", interval: "month", amount: 4900, currency: "usd" },
    ],
  });

  expect(created.isError).toBe(false);
  await expect(row(communities, `Club ${id}`)).toHaveCount(1, LIVE);
  await expect(
    row(leads, `Owner ${id}`).getByRole("cell", { name: "1", exact: true }),
  ).toBeVisible(LIVE);
  expect(await seed.findCommunityBySkoolId(`skool-${id}`)).toMatchObject({
    memberCount: 250,
    monthlyPriceUsd: 49,
  });
  await close();
});

test("a rename by an agent shows on the open list and on the lead's own page", async ({
  browser,
  seed,
}) => {
  const { watcher, agent, close } = await setupWatcher(browser, seed);
  const id = token();
  const lead = await seed.createLead({
    skoolUsername: `e2e-${id}`,
    name: `Before ${id}`,
  });
  const list = await watcher.newPage();
  const detail = await watcher.newPage();
  await list.goto(`/admin/leads?search=${id}`);
  await detail.goto(`/admin/leads/${lead.leadId}`);
  await expect(row(list, `Before ${id}`)).toHaveCount(1);

  const updated = await agent("update_lead", {
    leadId: lead.leadId,
    name: `After ${id}`,
  });

  expect(updated.isError).toBe(false);
  await expect(row(list, `After ${id}`)).toHaveCount(1, LIVE);
  await expect(
    detail.getByRole("heading", { name: `After ${id}` }),
  ).toBeVisible(LIVE);
  expect(await seed.findLeadByUsername(`e2e-${id}`)).toMatchObject({
    name: `After ${id}`,
  });
  await close();
});

test("a lead outside the list's search does not appear, while one that matches does", async ({
  browser,
  seed,
}) => {
  const { watcher, agent, close } = await setupWatcher(browser, seed);
  const id = token();
  const page = await watcher.newPage();
  await page.goto(`/admin/leads?search=${id}`);
  await expect(page.getByText("No leads found.")).toBeVisible();

  await agent("create_lead", {
    skoolUsername: `other-${token()}`,
    name: `Unrelated ${token()}`,
  });
  // The matching lead is the proof that the earlier event was already handled
  await agent("create_lead", {
    skoolUsername: `match-${id}`,
    name: `Matching ${id}`,
  });

  await expect(row(page, `Matching ${id}`)).toHaveCount(1, LIVE);
  await expect(page.getByText("Unrelated")).toHaveCount(0);
  await close();
});

test("an open second page stays on the second page when an agent adds a lead", async ({
  browser,
  seed,
}) => {
  const { watcher, agent, close } = await setupWatcher(browser, seed);
  const id = token();
  for (let index = 0; index < 13; index += 1) {
    await seed.createLead({
      skoolUsername: `e2e-${id}-${String(index).padStart(2, "0")}`,
      name: `Seed ${id} ${String(index).padStart(2, "0")}`,
    });
  }
  const page = await watcher.newPage();
  await page.goto(`/admin/leads?search=${id}&page=2`);
  await expect(row(page, `Seed ${id}`)).toHaveCount(1);

  await agent("create_lead", {
    skoolUsername: `e2e-${id}-new`,
    name: `Seed ${id} new`,
  });

  await expect(row(page, `Seed ${id}`)).toHaveCount(2, LIVE);
  await expect(page).toHaveURL(/page=2/);
  await close();
});

test("a refused write changes nothing on screen or in the database", async ({
  browser,
  seed,
}) => {
  const { watcher, agent, close } = await setupWatcher(browser, seed);
  const id = token();
  await seed.createLead({ skoolUsername: `e2e-${id}`, name: `Original ${id}` });
  const page = await watcher.newPage();
  await page.goto(`/admin/leads?search=${id}`);
  await expect(row(page, `Original ${id}`)).toHaveCount(1);

  const refused = await agent("create_lead", {
    skoolUsername: `e2e-${id}`,
    name: `Imposter ${id}`,
  });
  const probe = await agent("create_lead", {
    skoolUsername: `probe-${id}`,
    name: `Probe ${id}`,
  });

  expect(refused.isError).toBe(true);
  expect(probe.isError).toBe(false);
  await expect(row(page, `Probe ${id}`)).toHaveCount(1, LIVE);
  await expect(row(page, `Original ${id}`)).toHaveCount(1);
  await expect(page.getByText(`Imposter ${id}`)).toHaveCount(0);
  expect(await seed.findLeadByUsername(`e2e-${id}`)).toMatchObject({
    name: `Original ${id}`,
  });
  await close();
});

test("a browser that was offline when the agent wrote catches up once it is back", async ({
  browser,
  seed,
}) => {
  const { watcher, agent, close } = await setupWatcher(browser, seed);
  const id = token();
  const page = await watcher.newPage();
  await page.goto(`/admin/leads?search=${id}`);
  await expect(page.getByText("No leads found.")).toBeVisible();

  await watcher.setOffline(true);
  await agent("create_lead", {
    skoolUsername: `e2e-${id}`,
    name: `Missed ${id}`,
  });
  await page.waitForTimeout(500);
  await watcher.setOffline(false);

  await expect(row(page, `Missed ${id}`)).toHaveCount(1, { timeout: 20_000 });
  await close();
});

test("an admin can open, edit and delete a lead the agent created like any other", async ({
  browser,
  page,
  seed,
}) => {
  const { admin, agent, close } = await setupWatcher(browser, seed);
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const created = await agent("create_lead", {
    skoolUsername: `e2e-${id}`,
    name: `By agent ${id}`,
  });
  const leadId = Number(field(created.value, "leadId"));

  await page.goto(`/admin/leads/${leadId}/edit`);
  await page.getByLabel(/^Name\s*\*?$/).fill(`Edited ${id}`);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/leads/${leadId}$`));
  await expect
    .poll(() => seed.findLeadByUsername(`e2e-${id}`))
    .toMatchObject({ name: `Edited ${id}` });

  await page.goto(`/admin/leads?search=${id}`);
  await rowActions(page, `Edited ${id}`).click();
  await confirmDelete(page);

  await expect.poll(() => seed.findLeadByUsername(`e2e-${id}`)).toBeNull();
  await close();
});
